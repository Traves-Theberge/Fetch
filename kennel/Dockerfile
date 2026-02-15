# Fetch Kennel - AI CLI Execution Sandbox
# The Muscle: Supports GitHub Copilot, Claude Code, Gemini CLI, OpenCode, and Codex
# Toggle CLIs via ENABLE_COPILOT, ENABLE_CLAUDE, ENABLE_GEMINI, ENABLE_OPENCODE, ENABLE_CODEX in .env

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

RUN gh copilot --help >/dev/null 2>&1 || gh extension install github/gh-copilot || true

# ============================================
# Install AI CLIs (Claude, Gemini, OpenCode, Codex)
# ============================================
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli opencode-ai@latest @openai/codex

# ============================================
# Install Playwright + Chromium for browser automation
# ============================================
RUN npx playwright install --with-deps chromium

# ============================================
# Install browser agent script
# ============================================
COPY browser-agent.mjs /usr/local/lib/fetch-browser/browser-agent.mjs

# ============================================
# Configure git identity for init/commit operations
# ============================================
RUN git config --global user.email "fetch@kennel.local" \
    && git config --global user.name "Fetch" \
    && git config --global init.defaultBranch main

# ============================================
# Entrypoint: configure git auth from GH_TOKEN at runtime
# ============================================
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

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
    && mkdir -p /root/.claude \
    && mkdir -p /root/.gemini \
    && mkdir -p /root/.config/opencode \
    && mkdir -p /root/.codex

# Set working directory
WORKDIR /workspace

# Default command (keep container running)
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
