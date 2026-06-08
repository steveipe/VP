import re

def validate_section_document_uploads(text):
    t = (text or "").strip()
    print(f"Input text: '{text}'")
    print(f"Stripped text: '{t}'")
    print(f"Empty check: t == '' = {t == ''}")
    
    pattern = r"\.(pdf|docx|doc|xls|xlsx|jpg|png)"
    match = re.search(pattern, t, re.I)
    print(f"Regex pattern: {pattern}")
    print(f"Regex match: {match}")
    
    if t == "" or re.search(r"\.(pdf|docx|doc|xls|xlsx|jpg|png)", t, re.I):
        return True, ""
    return False, "Please list supporting files or attachments and their formats."

# Test cases
tests = ["test.xlsx", "test.xls", "file.pdf", "", "  "]
for test in tests:
    print(f"\n--- Testing: '{test}' ---")
    result = validate_section_document_uploads(test)
    print(f"Result: valid={result[0]}, message='{result[1]}'")
