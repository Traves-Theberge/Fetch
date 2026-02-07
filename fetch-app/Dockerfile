# Fetch Bridge - Node.js Container
# The Brain: WhatsApp client and orchestration layer

# Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY fetch-app/package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY fetch-app/tsconfig.json ./
COPY fetch-app/src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install dependencies for Puppeteer (whatsapp-web.js requirement), SQLite runtime, and whisper.cpp
RUN apt-get update && apt-get install -y \
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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Build and install whisper.cpp for local transcription (100% free, no API)
# Note: The binary is named 'whisper-cli' after build, we rename it to 'whisper-cpp'
# Must also copy shared libraries (libwhisper.so, libggml.so) and run ldconfig
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

# Download the tiny whisper model (fast, ~75MB - good for voice notes)
RUN mkdir -p /app/models \
    && wget -q -O /app/models/ggml-tiny.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY fetch-app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy documentation
COPY docs ./docs

# Create data directory with proper permissions
RUN mkdir -p /app/data && chmod 777 /app/data

# Configure git identity for /init and /clone operations
RUN git config --global user.email "fetch@kennel.local" \
    && git config --global user.name "Fetch" \
    && git config --global init.defaultBranch main

# Entrypoint cleans stale Chromium lock files before starting Node.
# This prevents crash loops after unclean container shutdowns.
COPY fetch-app/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
