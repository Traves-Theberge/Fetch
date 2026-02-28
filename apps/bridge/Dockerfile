# Fetch Bridge - Turborepo Monorepo Docker Build
# Four-stage pattern: prune → install deps → build → production runtime

# ── Stage 1: Prune monorepo ────────────────────────────
# Generate a minimal workspace subset for @fetch/bridge only.
# turbo prune --docker splits output into json/ (package manifests) and
# full/ (source code) for optimal Docker layer caching.
FROM node:20-slim AS pruner

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @fetch/bridge --docker

# ── Stage 2: Install dependencies (cached layer) ──────
# This layer is only invalidated when package.json or lockfile changes,
# NOT when source code changes. This is the key Docker caching win.
FROM node:20-slim AS installer

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Native module build deps (better-sqlite3 requires python3/make/g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy ONLY package.json files + pruned lockfile (dependency layer)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# npm ci — deterministic install from lockfile
RUN npm ci

# ── Stage 3: Build application ─────────────────────────
FROM installer AS builder
WORKDIR /app

# Copy full source code
COPY --from=pruner /app/out/full/ .

# Copy VERSION for build-time reference
COPY VERSION ./VERSION

# Build via Turborepo (respects dependsOn ordering: types → bridge)
RUN npx turbo run build --filter=@fetch/bridge

# ── Stage 4: Production runtime ────────────────────────
FROM node:20-slim AS runner

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# System dependencies: Chromium (WhatsApp/Puppeteer), whisper.cpp build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    python3 \
    make \
    g++ \
    git \
    cmake \
    ffmpeg \
    wget \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI (needed to exec commands in the kennel container via mounted socket)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Build and install whisper.cpp for local transcription (100% free, no API)
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /tmp/whisper.cpp \
    && cd /tmp/whisper.cpp \
    && cmake -B build -DBUILD_SHARED_LIBS=ON \
    && cmake --build build --config Release -j$(nproc) \
    && cp build/bin/whisper-cli /usr/local/bin/whisper-cpp \
    && chmod +x /usr/local/bin/whisper-cpp \
    && cp build/src/libwhisper.so* /usr/local/lib/ 2>/dev/null || true \
    && cp build/ggml/src/libggml*.so* /usr/local/lib/ 2>/dev/null || true \
    && ldconfig \
    && rm -rf /tmp/whisper.cpp \
    && echo '✅ whisper-cpp installed with shared libraries'

# Download the tiny whisper model (~75MB)
RUN mkdir -p /app/models \
    && wget -q -O /app/models/ggml-tiny.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin

# Puppeteer config
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package.json for production dependency install
COPY --from=builder /app/apps/bridge/package.json ./package.json

# Install production dependencies only (fresh, no dev deps)
RUN npm ci --omit=dev

# Copy compiled application from builder
COPY --from=builder /app/apps/bridge/dist ./dist

# Copy documentation (served by status API)
COPY docs ./docs

# Create data directory
RUN mkdir -p /app/data && chmod 777 /app/data

# Entrypoint cleans stale Chromium lock files before starting Node
COPY apps/bridge/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
