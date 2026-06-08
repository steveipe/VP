import requests
import json

tests = [
    ('test.xlsx', 'Excel file'),
    ('proposal.pdf', 'PDF file'),
    ('costs.xls', 'XLS file'),
    ('Company Profile.docx (Word)', 'Complex format string'),
    ('Project Plan.xlsx (Excel) Cost Proposal.xlsx (Excel)', 'Multiple files'),
    ('', 'Empty string'),
]

print("Testing document_uploads validation...")
print("-" * 70)

all_pass = True
for content, label in tests:
    resp = requests.post('http://127.0.0.1:8000/api/ai/proposal-chat', json={
        'messages': [{'role': 'user', 'content': content}],
        'rfp_context': 'Test',
        'section_index': 12
    })
    data = resp.json()
    status = 'PASS' if data['section_index'] == 13 else 'FAIL'
    if status == 'FAIL':
        all_pass = False
    print(f"{status}: {label:40} -> section {data['section_index']}")

print("-" * 70)
print(f"Overall: {'ALL TESTS PASSED' if all_pass else 'SOME TESTS FAILED'}")
