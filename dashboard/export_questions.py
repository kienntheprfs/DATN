import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

# Fix for psycopg on Windows (Async mode)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure the 'dashboard' directory is in the path so we can import 'src'
# This script is intended to be run from the 'dashboard' directory.
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from src.pipeline.inputs.conversation_history_input import ConversationHistoryInput

async def main():
    # 1. Initialize the adapter
    # It will use settings.database_url from dashboard/.env
    adapter = ConversationHistoryInput()
    
    # 2. Define time range (last 2 years to capture everything)
    to_ts = datetime.now(timezone.utc)
    from_ts = to_ts - timedelta(days=730) 
    
    print(f"--- Question Export Tool ---")
    print(f"Time range: {from_ts.strftime('%Y-%m-%d')} to {to_ts.strftime('%Y-%m-%d')}")
    
    # 3. Fetch documents
    # db is unused in this adapter's implementation
    try:
        documents = await adapter.fetch(db=None, from_ts=from_ts, to_ts=to_ts)
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    if not documents:
        print("No human messages found in the database checkpoints.")
        return

    # 4. Sort documents by timestamp (Newest to Oldest)
    # Some timestamps might be None, we treat them as oldest
    documents.sort(key=lambda x: x[1] if x[1] is not None else datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    # 5. Extract and clean content
    questions = []
    for content, _ in documents:
        clean_text = content.strip().replace("\n", " ")
        if clean_text:
            questions.append(clean_text)

    # 6. Write to file
    output_path = os.path.join(current_dir, "extracted_questions.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        for q in questions:
            f.write(f"{q}\n")

    print(f"Successfully exported {len(questions)} unique questions to {output_path}")
    print(f"---------------------------")

if __name__ == "__main__":
    asyncio.run(main())
