import os
import csv
import uuid
import json
import requests
import sys

# Determine directory paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(CURRENT_DIR, "manual_test.csv")
DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
USER_ID = "6fbf6278-b3ba-4135-9abf-97193058edb7"
AGENT_ID = "router-agent"  # Multi agent router is the default agent

# Read authorization secret if set
AUTH_SECRET = os.getenv("AUTH_SECRET")

def get_headers():
    headers = {
        "Content-Type": "application/json",
        "X-User-Id": USER_ID,
    }
    if AUTH_SECRET:
        headers["Authorization"] = f"Bearer {AUTH_SECRET}"
    return headers

def run_test_case(stt, category, question, thread_id, backend_url):
    print("\n" + "=" * 80)
    print(f"[{stt}] Category: {category}")
    print(f"Question: {question}")
    print("-" * 80)
    
    url = f"{backend_url}/{AGENT_ID}/stream"
    payload = {
        "message": question,
        "thread_id": thread_id,
        "model": None,
        "stream_tokens": True,
        "query_mode": "deep"  # Use deep mode
    }

    try:
        response = requests.post(url, json=payload, headers=get_headers(), stream=True, timeout=60)
        
        if response.status_code != 200:
            print(f"Error: Server returned status code {response.status_code}")
            try:
                print(response.json())
            except Exception:
                print(response.text)
            return None

        full_answer = []
        citations = []

        print("Chatbot: ", end="", flush=True)
        for line in response.iter_lines():
            if not line:
                continue
            
            line_str = line.decode("utf-8").strip()
            if not line_str.startswith("data: "):
                continue
            
            data_content = line_str[6:]  # Strip "data: "
            if data_content == "[DONE]":
                break
                
            try:
                event = json.loads(data_content)
                event_type = event.get("type")
                content = event.get("content")
                
                if event_type == "token":
                    print(content, end="", flush=True)
                    full_answer.append(content)
                elif event_type == "citations_ready":
                    # Capture citations for later display
                    citations = event.get("content") or event.get("data") or []
                elif event_type == "error":
                    print(f"\n[Error Event]: {content}")
            except json.JSONDecodeError:
                pass
        
        print()  # Final newline for chatbot answer
        
        if citations:
            print("\nCitations / Sources:")
            for idx, cite in enumerate(citations, 1):
                file_name = cite.get("file_name", "Unknown Document")
                s3_url = cite.get("s3_url", "")
                preview = cite.get("text_preview", "")
                is_faq = cite.get("is_faq", False)
                
                print(f"  {idx}. {file_name} " + ("[FAQ]" if is_faq else ""))
                if s3_url:
                    print(f"     URL: {s3_url}")
                if preview:
                    print(f"     Preview: {preview[:150]}...")
                    
        return "".join(full_answer)
                    
    except requests.exceptions.RequestException as e:
        print(f"\nRequest failed: {e}")
        return None

def save_csv(header, all_rows):
    try:
        with open(CSV_PATH, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if header:
                writer.writerow(header)
            writer.writerows(all_rows)
        print(f"-> Successfully saved progress to manual_test.csv")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

def main():
    print("=== Chatbot Agent Direct API Stream Tester ===")
    
    # Verify CSV file exists
    if not os.path.exists(CSV_PATH):
        print(f"Error: CSV file not found at {CSV_PATH}")
        sys.exit(1)

    # Let user specify custom backend URL
    backend_url = DEFAULT_BACKEND_URL
    print(f"Backend URL: {backend_url}")
    print(f"User ID: {USER_ID}")
    print(f"Agent ID: {AGENT_ID}")
    print(f"Mode: Deep Mode (query_mode='deep')")
    
    # Read test cases from CSV
    header = None
    all_rows = []
    with open(CSV_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if not row:
                continue
            all_rows.append(row)
            
    print(f"Loaded {len(all_rows)} test cases from manual_test.csv")
    
    # Find the target column index
    answer_col_idx = -1
    if header:
        for idx, col in enumerate(header):
            if col.strip() == "Câu trả lời của chatbot":
                answer_col_idx = idx
                break
                
    if answer_col_idx == -1:
        print("Warning: Could not find column 'Câu trả lời của chatbot' in CSV header. Defaulting to index 4.")
        answer_col_idx = 4
    
    # Generate unique thread ID for this run session
    thread_id = str(uuid.uuid4())
    print(f"Session Thread ID: {thread_id}")
    
    print("\nOptions:")
    print("1. Run all test cases sequentially")
    print("2. Run a specific test case by STT (e.g., AG-021)")
    print("3. Run interactively (asks to continue after each case)")
    print("4. Run a range of test cases (e.g., AG-022 to AG-030, or AG-022 to end)")
    print("5. Exit")
    
    choice = input("Enter your choice (1-5): ").strip()
    
    if choice == "1":
        for row in all_rows:
            stt, cat, q = row[0], row[1], row[2]
            ans = run_test_case(stt, cat, q, thread_id, backend_url)
            if ans is not None:
                # Ensure the row has enough columns
                while len(row) <= answer_col_idx:
                    row.append("")
                row[answer_col_idx] = ans
                save_csv(header, all_rows)
    elif choice == "2":
        target_stt = input("Enter STT to search (e.g. AG-021): ").strip()
        found = False
        for row in all_rows:
            stt, cat, q = row[0], row[1], row[2]
            if stt.lower() == target_stt.lower():
                ans = run_test_case(stt, cat, q, thread_id, backend_url)
                if ans is not None:
                    while len(row) <= answer_col_idx:
                        row.append("")
                    row[answer_col_idx] = ans
                    save_csv(header, all_rows)
                found = True
                break
        if not found:
            print(f"No test case found with STT: {target_stt}")
    elif choice == "3":
        for row in all_rows:
            stt, cat, q = row[0], row[1], row[2]
            ans = run_test_case(stt, cat, q, thread_id, backend_url)
            if ans is not None:
                while len(row) <= answer_col_idx:
                    row.append("")
                row[answer_col_idx] = ans
                save_csv(header, all_rows)
            cont = input("\nPress Enter to continue to next test case, or 'q' to quit: ").strip().lower()
            if cont == "q":
                break
    elif choice == "4":
        print("\n--- Run Range of Test Cases ---")
        print("Format examples:")
        print("  - Starting STT: AG-022 | Ending STT: AG-030  => Runs from AG-022 to AG-030")
        print("  - Starting STT: AG-022 | Ending STT: [Empty] => Runs from AG-022 to the end of the file")
        print("-" * 50)
        start_stt = input("Enter starting STT (e.g., AG-022): ").strip()
        end_stt = input("Enter ending STT (optional, press Enter for running to the end): ").strip()
        
        start_idx = -1
        end_idx = len(all_rows) - 1
        
        for idx, row in enumerate(all_rows):
            if row[0].lower() == start_stt.lower():
                start_idx = idx
            if end_stt and row[0].lower() == end_stt.lower():
                end_idx = idx
                
        if start_idx == -1:
            print(f"Could not find starting STT: {start_stt}")
        elif end_stt and end_idx < start_idx:
            print(f"Invalid range: Ending STT '{end_stt}' appears before Starting STT '{start_stt}'")
        else:
            print(f"Running test cases from {all_rows[start_idx][0]} to {all_rows[end_idx][0]}...")
            for idx in range(start_idx, end_idx + 1):
                row = all_rows[idx]
                stt, cat, q = row[0], row[1], row[2]
                ans = run_test_case(stt, cat, q, thread_id, backend_url)
                if ans is not None:
                    while len(row) <= answer_col_idx:
                        row.append("")
                    row[answer_col_idx] = ans
                    save_csv(header, all_rows)
    else:
        print("Exiting.")

if __name__ == "__main__":
    main()
