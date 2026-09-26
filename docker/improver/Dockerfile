# Sandbox for the bot improver: Claude Code plus everything needed to test a bot against the game.
# Built by the host (src/improver.ts). The game source, README and ROM are mounted read-only at run time.
FROM node:26-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ripgrep jq curl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code --no-audit --no-fund

# the game's dependencies, built for Linux (isolated-vm is native)
WORKDIR /work/app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && chown -R node:node /work

COPY docker/improver/pokered-test /usr/local/bin/pokered-test
RUN chmod 755 /usr/local/bin/pokered-test

ENV ROM_PATH=/work/app/roms/red.gb
USER node
WORKDIR /work
