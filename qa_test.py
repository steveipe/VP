import requests, json
payload = json.load(open('simulate_payload.json','r'))
resp = requests.post('http://127.0.0.1:8000/api/rfp/qa-review', json=payload, timeout=30)
print('STATUS', resp.status_code)
try:
    print(json.dumps(resp.json(), indent=2))
except Exception:
    print(resp.text)
