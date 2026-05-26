#!/bin/sh
set -e

DAEMON_PORT="${OD_PORT:-7456}"
DAEMON_HOST="${OD_BIND_HOST:-127.0.0.1}"
DAEMON_URL="http://${DAEMON_HOST}:${DAEMON_PORT}"
HEALTH_URL="${DAEMON_URL}/api/health"
MAX_WAIT=30

# ---- Inject Claude Code credentials from env ----
SETTINGS="/home/open-design/.claude/settings.json"
if [ -n "${ANTHROPIC_AUTH_TOKEN}" ]; then
    echo "[entrypoint] Injecting ANTHROPIC_AUTH_TOKEN ..."
    sed -i "s|__PLACEHOLDER_AUTH_TOKEN__|${ANTHROPIC_AUTH_TOKEN}|g" "${SETTINGS}"
fi
if [ -n "${ANTHROPIC_BASE_URL}" ]; then
    echo "[entrypoint] Injecting ANTHROPIC_BASE_URL ..."
    sed -i "s|__PLACEHOLDER_BASE_URL__|${ANTHROPIC_BASE_URL}|g" "${SETTINGS}"
fi

# ---- Start daemon ----
echo "[entrypoint] Starting Open Design daemon on ${DAEMON_URL} ..."
node apps/daemon/dist/cli.js --no-open &
DAEMON_PID=$!

trap "kill ${DAEMON_PID} 2>/dev/null; exit 0" TERM INT QUIT

echo "[entrypoint] Waiting for daemon to become healthy (max ${MAX_WAIT}s) ..."
waited=0
while [ ${waited} -lt ${MAX_WAIT} ]; do
    if wget -qO- "${HEALTH_URL}" > /dev/null 2>&1; then
        echo "[entrypoint] Daemon is healthy after ${waited}s."
        break
    fi
    sleep 1
    waited=$((waited + 1))
done

if [ ${waited} -ge ${MAX_WAIT} ]; then
    echo "[entrypoint] WARNING: Daemon did not become healthy within ${MAX_WAIT}s, starting nginx anyway."
fi

echo "[entrypoint] Preparing nginx runtime directories ..."
mkdir -p \
    /tmp/nginx/client_body \
    /tmp/nginx/proxy \
    /tmp/nginx/fastcgi \
    /tmp/nginx/uwsgi \
    /tmp/nginx/scgi

echo "[entrypoint] Starting nginx on :80 ..."
nginx -t -c /etc/nginx/nginx.conf -e /dev/stderr
exec nginx -c /etc/nginx/nginx.conf -e /dev/stderr -g 'daemon off;'
