#!/usr/bin/env python3
import sys
sys.path.insert(0, 'c:\\Users\\ASUS\\Desktop\\VP4\\backend')

import re

# Copy the validation logic from ai_service.py
def validate_section_document_uploads(text):
    t = (text or "").strip()
    print(f"Testing: '{text}'")
    print(f"  Stripped: '{t}'")
    print(f"  Empty: {t == ''}")
    
    if t == "" or re.search(r"\.(pdf|docx|doc|xls|xlsx|jpg|png)", t, re.I):
        print(f"  Result: VALID")
        return True
    else:
        print(f"  Result: INVALID")
        return False

# Test cases
tests = [
    'proposal.pdf',
    'test.xlsx',
    'cost.xls',
    'doc.docx',
    'image.jpg',
    '',
    '  ',
    'noextension',
]

print("Direct Validation Testing")
print("=" * 50)
for test in tests:
    validate_section_document_uploads(test)
    print()
