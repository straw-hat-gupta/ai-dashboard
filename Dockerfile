# --- build the frontend ---
FROM node:20-slim AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# --- runtime ---
FROM node:20-slim AS runtime

# The official CLIs this dashboard reads usage from. Pin loosely (latest) so
# `docker compose build --no-cache` picks up their updates; if a specific
# CLI version matters to you, pin it here.
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev

COPY server/src ./src
COPY --from=web-build /app/web/dist /app/web/dist

ENV DATA_DIR=/data
ENV PORT=4200
EXPOSE 4200
VOLUME ["/data"]

CMD ["node", "src/index.js"]
