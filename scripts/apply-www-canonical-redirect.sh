#!/usr/bin/env bash
# Apply apex → www 301 on the production nginx host.
# Usage:
#   ./scripts/apply-www-canonical-redirect.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/apply-www-canonical-redirect.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
CONF="/etc/nginx/conf.d/lilnong.top-https.conf"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

echo "==> Backup + patch $CONF on $DEPLOY_HOST"
"${SSH[@]}" "$DEPLOY_HOST" bash -s <<'REMOTE'
set -euo pipefail
CONF="/etc/nginx/conf.d/lilnong.top-https.conf"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "${CONF}.bak-seo-www-${STAMP}"

python3 - <<'PY'
from pathlib import Path

path = Path("/etc/nginx/conf.d/lilnong.top-https.conf")
text = path.read_text()

# 1) HTTP redirect always to www
text2 = text.replace(
    "return       301 https://$host$request_uri;",
    "return       301 https://www.lilnong.top$request_uri;",
    1,
)

apex_block = """
# Apex HTTPS → www (SEO canonical host)
server {
    listen       443 ssl;
    listen       [::]:443 ssl;
    http2        on;
    server_name  lilnong.top;

    ssl_certificate /etc/letsencrypt/live/lilnong.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lilnong.top/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_prefer_server_ciphers on;

    return 301 https://www.lilnong.top$request_uri;
}

"""

marker = "# Main domain (lilnong.top / www.lilnong.top) - Personal Site\nserver {"
if "server_name  lilnong.top;\n" in text2 and "return 301 https://www.lilnong.top$request_uri;" in text2.split("Main domain", 1)[0]:
    print("Apex HTTPS redirect already present; only ensuring HTTP/www server_name")
else:
    if marker not in text2:
        raise SystemExit("Could not find main domain server marker")
    text2 = text2.replace(marker, apex_block + marker, 1)

# 2) Main HTTPS block serves www only
old = """# Main domain (lilnong.top / www.lilnong.top) - Personal Site
server {
    listen       443 ssl;
    listen       [::]:443 ssl;
    http2        on;
    server_name  lilnong.top www.lilnong.top;
"""
new = """# Main domain (www.lilnong.top) - Personal Site
server {
    listen       443 ssl;
    listen       [::]:443 ssl;
    http2        on;
    server_name  www.lilnong.top;
"""
if old in text2:
    text2 = text2.replace(old, new, 1)
elif "server_name  www.lilnong.top;" in text2:
    print("Main server_name already www-only")
else:
    # fallback: replace first dual server_name after Main domain
    idx = text2.find("Main domain")
    if idx < 0:
        raise SystemExit("Main domain block missing")
    text2 = (
        text2[:idx]
        + text2[idx:]
        .replace("server_name  lilnong.top www.lilnong.top;", "server_name  www.lilnong.top;", 1)
    )

path.write_text(text2)
print("Patched", path)
PY

nginx -t
systemctl reload nginx
echo "nginx reloaded"
REMOTE

echo "==> Verify redirects"
curl -sI "https://lilnong.top/" | head -8
curl -sI "http://lilnong.top/" | head -8
curl -sI "https://www.lilnong.top/" | head -5
echo "==> Done"
