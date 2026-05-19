import requests
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
WAYFINDER_API = "http://127.0.0.1:8004"

def test():
    queries = ["phòng 1", "b4", "a4", "tòa a4"]
    for q in queries:
        print(f"\nSearching for: {q}")
        r = requests.get(f"{WAYFINDER_API}/api/aliases/search", params={"q": q, "limit": 5})
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            print(json.dumps(r.json(), indent=2, ensure_ascii=False))
        else:
            print("Failed")

if __name__ == "__main__":
    test()
