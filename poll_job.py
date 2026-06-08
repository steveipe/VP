import urllib.request, json, time
job='8128add6-abfe-48e9-a2cb-ca06645001aa'
for i in range(30):
    try:
        req=urllib.request.Request(f'http://localhost:3000/api/ai/parse-rfp/jobs/{job}', headers={'Accept':'application/json'})
        r=urllib.request.urlopen(req)
        j=json.loads(r.read().decode())
        print('Attempt', i, 'status:', j.get('job', {}).get('status'))
        if j.get('job', {}).get('status')=='completed':
            print('Result:', json.dumps(j.get('job', {}).get('result')))
            break
    except Exception as e:
        print('Attempt', i, 'error', e)
    time.sleep(2)
