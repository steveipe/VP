import requests, time, json
BACKEND = 'http://127.0.0.1:8000'

PROPOSAL_SECTION_KEYS = [
  'vendor_information',
  'company_profile',
  'project_understanding',
  'proposed_solution',
  'deliverables',
  'project_timeline',
  'cost_proposal',
  'team_details',
  'past_experience',
  'risk_management',
  'support_maintenance',
  'graphs_visualizations',
  'terms_conditions',
  'document_uploads',
  'final_declaration',
]

sample_answers = {k: f'Sample answer for {k.replace("_"," ")}' for k in PROPOSAL_SECTION_KEYS}

print('Posting QA review...')
payload = {
    'answers': sample_answers,
    'selectedTemplate': 'software',
    'selectedSubsystems': ['full'],
    'projectTitle': 'Simulated Project',
    'organizationName': 'Simulated Org',
    'category': 'software',
    'additionalDetails': 'Simulated additional details'
}

try:
    r = requests.post(BACKEND + '/api/rfp/qa-review', json=payload, timeout=30)
    print('QA review status:', r.status_code)
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception as e:
        print('QA review response text:', r.text)
except Exception as e:
    print('QA review request failed:', e)
    raise SystemExit(1)

# Start generation
sections_payload = {k: sample_answers.get(k, '') for k in PROPOSAL_SECTION_KEYS}
input_payload = {
    'organization_name': 'Simulated Org',
    'project_title': 'Simulated Project',
    'category': 'software',
    'sections': sections_payload,
    'detailed_project_description': 'Detailed description here',
    'additional_details': 'Additional details',
    'selected_template': 'software',
    'selectedSubsystems': ['full'],
}

print('\nStarting background generation...')
try:
    r2 = requests.post(BACKEND + '/api/rfp/generate/background', json=input_payload, timeout=30)
    print('Generate start status:', r2.status_code)
    data2 = r2.json()
    print(json.dumps(data2, indent=2))
    job_id = data2.get('job_id')
    if not job_id:
        print('No job_id returned')
        raise SystemExit(1)
except Exception as e:
    print('Generation start failed:', e)
    raise SystemExit(1)

print('\nPolling job:', job_id)
start = time.time()
while time.time() - start < 180:
    try:
        pr = requests.get(BACKEND + f'/api/rfp/generate/jobs/{job_id}', timeout=30)
        print('Poll status:', pr.status_code)
        try:
            dj = pr.json()
            print(json.dumps(dj, indent=2))
            job = dj.get('job') or dj
            status = job.get('status') if isinstance(job, dict) else None
            if status == 'completed':
                print('\nJob completed')
                break
            if status == 'failed':
                print('\nJob failed')
                break
        except Exception:
            print('Poll response text:', pr.text)
    except Exception as e:
        print('Poll request failed:', e)
    time.sleep(3)
else:
    print('Timed out waiting for job')

print('\nDone')
