import json
from pathlib import Path
from urllib import request, parse

path = Path(__file__).resolve().parent.parent / '.env.local'
text = path.read_text(encoding='utf-8')
env = {}
for line in text.splitlines():
    if not line or line.startswith('#'):
        continue
    if '=' not in line:
        continue
    key, val = line.split('=', 1)
    env[key.strip()] = val.strip().strip('"').strip("'")

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('SUPABASE_SERVICE_ROLE_KEY')
email = 'steveipe2006@gmail.com'
if not url or not key:
    raise SystemExit('Missing Supabase URL or service role key')

api = f"{url.rstrip('/')}/auth/v1/admin/users?email={parse.quote(email)}"
req = request.Request(api, method='GET')
req.add_header('apikey', key)
req.add_header('Authorization', 'Bearer ' + key)
with request.urlopen(req, timeout=20) as r:
    data = json.loads(r.read().decode())
    print(json.dumps(data, indent=2))
