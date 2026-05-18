#!/usr/bin/env bash
# GLB delivery diagnostics (no Meshy calls).
# Paste real URLs from Metro logs: [AR] raw modelUrl / proxied URL, or from GET /api/ai/scan/:id
#
# Usage:
#   export GLB_URL='https://res.cloudinary.com/.../raw/upload/.../file.glb'
#   export API_ORIGIN='https://your-api.example.com'   # no trailing /api
#   export PROXY_URL="${API_ORIGIN}/api/ai/proxy-glb?url=$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['GLB_URL'], safe=''))")"
#   ./backend/scripts/glb-delivery-check.sh
#
# Or run the curl lines manually after replacing placeholders.

set -euo pipefail

GLB_URL="${GLB_URL:-https://REPLACE_ME/raw/upload/.../model.glb}"
PROXY_URL="${PROXY_URL:-${API_ORIGIN:-https://REPLACE_API}/api/ai/proxy-glb?url=ENCODED_GLB_URL}"

echo "=== 1) Direct GLB URL (expect 200, content-type model/gltf-binary or application/octet-stream) ==="
echo "# curl -sSIL \"$GLB_URL\""
curl -sSIL "$GLB_URL" || true
echo

echo "=== 2) Proxied GLB URL (same expectations; HTML/JSON content-type = serving bug) ==="
echo "# curl -sSIL \"$PROXY_URL\""
curl -sSIL "$PROXY_URL" || true
echo

echo "=== 3) HEAD only on proxy (WebView probe path) ==="
echo "# curl -sSI -X HEAD \"$PROXY_URL\""
curl -sSI -X HEAD "$PROXY_URL" || true
echo

echo "Done. Note: content-length should match a real GLB size (often 1–50MB), not a tiny HTML error page."
