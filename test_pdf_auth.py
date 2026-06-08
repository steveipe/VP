#!/usr/bin/env python3
import requests
import json
import time

backend_url = 'http://localhost:8000'

pdf_payload = {
    'vendorResponse': {
        'vendor_information': 'ABC Corp Inc., Contact: john@abccorp.com',
        'company_profile': 'ABC Corp is a leading software development firm with 15 years of experience.',
        'project_understanding': 'We understand your need for a scalable cloud solution.',
        'proposed_solution': 'We recommend a cloud-based architecture using AWS.',
        'deliverables': 'Architecture design, Implementation code, Deployment guide',
        'project_timeline': '3 months',
        'cost_proposal': '$150,000',
        'team_details': 'Project Lead: Sarah Chen (PM)',
        'past_experience': 'Successfully delivered 25+ enterprise projects',
        'risk_management': 'Risk: Scope creep - Mitigation: Weekly reviews',
        'support_maintenance': '24/7 support with 4-hour response SLA',
        'graphs_visualizations': 'Timeline Gantt chart, Cost breakdown',
        'terms_conditions': 'Payment: 30% upfront, 40% at delivery',
        'document_uploads': 'Technical specifications.pdf',
        'final_declaration': 'Signed: John Smith, Date: 2026-06-04'
    },
    'options': {'template': 'executive'}
}

print('Testing PDF Generation with Bearer Token Auth')
print('-' * 60)

try:
    print('\n1. Queuing PDF job...')
    response = requests.post(
        f'{backend_url}/api/vendor/pdf/generate/background',
        json=pdf_payload,
        timeout=10
    )
    
    print(f'   Status: {response.status_code}')
    
    if response.ok:
        job_data = response.json()
        job_id = job_data.get('job_id')
        print(f'   Job ID: {job_id}')
        
        if job_id:
            print('\n2. Waiting for PDF generation (8 seconds)...')
            time.sleep(8)
            
            print('\n3. Checking job status...')
            status_response = requests.get(
                f'{backend_url}/api/vendor/pdf/generate/jobs/{job_id}',
                timeout=10
            )
            
            if status_response.ok:
                job_status = status_response.json()
                job = job_status.get('job', {})
                status = job.get('status')
                error = job.get('error')
                
                print(f'   Status: {status}')
                
                if error:
                    print(f'   Error: {error}')
                    print('\n   FAILED: PDFShift returned an error')
                elif status == 'completed':
                    print('\n   SUCCESS: PDF generated successfully!')
                else:
                    print(f'\n   Status: {status}')
            else:
                print(f'   Error checking status: {status_response.status_code}')
                print(f'   Response: {status_response.text}')
    else:
        print(f'   Error: {response.status_code}')
        print(f'   Response: {response.text}')

except Exception as e:
    print(f'   Exception: {e}')
    import traceback
    traceback.print_exc()

print('\n' + '-' * 60)
