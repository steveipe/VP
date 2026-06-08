#!/usr/bin/env python3
import requests
import json

api_key = "sk_30abbd922b3739b2e7c0513e7a48fa9067ab993a"
test_html = "<html><body><h1>Test</h1></body></html>"

print("Testing PDFShift API Key Directly")
print("=" * 60)
print(f"API Key: {api_key}")
print(f"Auth Method: Bearer Token")
print()

headers = {
    "Content-Type": "application/json",
    "X-API-Key": api_key,
    "X-Processor-Version": "142",
}

payload = {
    "source": test_html,
    "format": "A4",
    "margin": "10mm"
}

print("Sending request to PDFShift API...")
try:
    response = requests.post(
        "https://api.pdfshift.io/v3/convert/pdf",
        json=payload,
        headers=headers,
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print()
    
    try:
        response_json = response.json()
        print("Response:")
        print(json.dumps(response_json, indent=2))
    except:
        print(f"Response: {response.text[:500]}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
