import requests, json

url='http://127.0.0.1:8000/api/ai/proposal-chat'
rfp='RFP: Build a scalable procurement platform with security and integrations.'
contents=[
  "Acme Cloud Ltd. We provide managed cloud services, security, and integrations.",
  "We understand the client needs a scalable procurement platform to manage contracts, RFPs, vendor proposals, and integrations with existing ERPs. The goal is to improve procurement efficiency and compliance.",
  "We propose a modular microservices architecture with API-first design, secure auth, and a React-based UI. We'll integrate Supabase for auth and storage and include background AI analysis.",
  "Deliverables:\n1) Functional procurement platform — acceptance: end-to-end RFP flow\n2) Admin dashboard — acceptance: role-based access\n3) Integration adapters — acceptance: demo integration working",
  "Project Timeline: Phase 1 - Discovery (2 weeks). Phase 2 - MVP (3 months). Phase 3 - Pilot (1 month). Phase 4 - GA (2 weeks).",
  "USD 120,000 total. 30% upfront, 40% on MVP, 30% on delivery.",
  "Lead PM — 30%. Lead Engineer — 40%. QA Lead — 20%.",
  "We built a procurement portal for BetaCorp, reduced sourcing cycle by 30% and improved compliance.",
  "Key risks: integration delays, data migration. Mitigation: dedicated integration sprints, staging data validation.",
  "We provide 12 months support and SLA with 48-hour response time.",
  "We will include dashboards: vendor ranking, spend analysis, timeline burn-down.",
  "Standard agreement with IP assignment, confidentiality, termination clauses.",
  "proposal.pdf, team_bios.pdf",
  "John Doe, CEO, 2026-06-08"
]

section_index=1
for i in range(section_index, len(contents)):
    payload={
        'messages':[{'role':'user','content':contents[i]}],
        'rfp_context': rfp,
        'section_index': i,
        'vendor_name':'Acme Cloud'
    }
    r=requests.post(url, json=payload, timeout=10)
    print('Sent section', i)
    print('Status', r.status_code)
    try:
        data=r.json()
    except Exception as e:
        print('Response not JSON', r.text)
        break
    print(json.dumps(data, indent=2))
    if data.get('proposal_ready'):
        print('Proposal marked ready at section', i)
        break
