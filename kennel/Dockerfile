# Fetch Kennel - AI CLI Execution Sandbox
# The Muscle: Contains Claude Code, Gemini CLI, and GitHub Copilot

FROM ubuntu:22.04

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
    nodejs \
    npm \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Upgrade Node.js to latest LTS
RUN npm install -g n && n lts && npm install -g npm@latest

# ============================================
# Install GitHub CLI
# ============================================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub Copilot CLI extension
RUN gh extension install github/gh-copilot || true

# ============================================
# Install Claude Code CLI
# ============================================
RUN npm install -g @anthropic-ai/claude-code

# ============================================
# Install Gemini CLI
# ============================================
RUN npm install -g @google/gemini-cli

# ============================================
# Create workspace directory
# ============================================
RUN mkdir -p /workspace && chmod 777 /workspace

# ============================================
# Create config directories
# ============================================
RUN mkdir -p /root/.config/gh \
    && mkdir -p /root/.config/claude

# Set working directory
WORKDIR /workspace

# Default command (keep container running)
CMD ["tail", "-f", "/dev/null"]
