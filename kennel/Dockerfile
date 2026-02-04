# Fetch Kennel - AI CLI Execution Sandbox
# The Muscle: Supports GitHub Copilot, Claude Code, and Gemini CLI
# Toggle CLIs via ENABLE_COPILOT, ENABLE_CLAUDE, ENABLE_GEMINI in .env

FROM node:20-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    python3-venv \
    golang-go \
    cargo \
    rustc \
    jq \
    tree \
    build-essential \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# Install GitHub CLI + Copilot Extension
# ============================================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

RUN gh extension install github/gh-copilot || true

# ============================================
# Install AI CLIs (Claude, Gemini)
# ============================================
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli

# ============================================
# Create workspace directory
# ============================================
RUN mkdir -p /workspace && chmod 777 /workspace

# ============================================
# Create config directories for CLI auth
# ============================================
# Mounted from host at runtime (read-only)
RUN mkdir -p /root/.config/gh \
    && mkdir -p /root/.config/claude-code \
    && mkdir -p /root/.gemini

# Set working directory
WORKDIR /workspace

# Default command (keep container running)
CMD ["tail", "-f", "/dev/null"]
