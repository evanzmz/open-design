# ---------------------------------------------------------------------------
# Open Design + Nginx + Claude Code (single container)
#
# Based on the official Open Design image, adds:
#   1. Nginx reverse proxy on :80
#   2. Claude Code CLI (npm global)
#
# Usage:
#   docker build -f deploy/nginx/Dockerfile -t open-design-nginx deploy/nginx/
#   docker compose -f deploy/nginx/docker-compose.yml up
# ---------------------------------------------------------------------------

ARG OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest
FROM ${OPEN_DESIGN_IMAGE}

USER root

RUN apk add --no-cache nginx wget && \
    npm install -g @anthropic-ai/claude-code && \
    chown -R open-design:open-design /var/lib/nginx /var/log/nginx

# ---- Claude Code: skip onboarding ----
RUN mkdir -p /home/open-design/.claude && \
    echo '{"hasCompletedOnboarding": true}' \
      > /home/open-design/.claude.json && \
    chown -R open-design:open-design /home/open-design/.claude /home/open-design/.claude.json

# ---- Claude Code: default settings (entrypoint injects env vars) ----
COPY claude-settings.json /home/open-design/.claude/settings.json
RUN chown open-design:open-design /home/open-design/.claude/settings.json

# ---- Nginx config ----
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/http.d/default.conf

# ---- Entrypoint ----
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Daemon listens on localhost only; nginx fronts it
ENV OD_BIND_HOST=127.0.0.1

EXPOSE 80

USER open-design
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
