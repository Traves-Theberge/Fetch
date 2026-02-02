# Fetch Bridge - Node.js Container
# The Brain: WhatsApp client and orchestration layer

# Build stage
FROM node:20-slim AS builder

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

# Install dependencies for Puppeteer (whatsapp-web.js requirement)
RUN apt-get update && apt-get install -y \
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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

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

CMD ["node", "dist/index.js"]
