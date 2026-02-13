# Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Linux host | Debian/Ubuntu | Recommended OS |
| OpenRouter Key | — | Required for LLM access ([openrouter.ai](https://openrouter.ai)) |
| WhatsApp Account| — | Required for primary interface |

> **Note:** The `install.sh` script handles the installation of Docker, Go, Node.js, and GitHub CLI for you.

## Installation

### 1. clone & Install

The automated installer sets up all dependencies (Docker, Go, Node.js v20, gh), builds the Manager TUI, and installs the `fetch` systemd service.

```bash
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch
chmod +x install.sh
sudo ./install.sh
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set your critical variables:

```env
OWNER_PHONE_NUMBER=15551234567
OPENROUTER_API_KEY=sk-or-...
```

### 3. Authenticate Harnesses (Optional)

Fetch uses CLI tools on your host for AI coding tasks. You should authenticate the ones you plan to use:

- **GitHub Copilot**: `gh auth login`
- **Claude Code**: `claude login`
- **Gemini CLI**: Set `GEMINI_API_KEY` in `.env`
- **OpenCode**: `opencode auth login`
- **Codex**: `codex login`

The Manager TUI's **🐕 Harnesses** screen can helps manage this state.

### 4. Start Fetch

Use the Manager TUI to manage the system.

```bash
cd manager
./fetch-manager
```

Select **🚀 Start Fetch** to launch the Docker containers.

### 5. Authenticate WhatsApp

On first launch, the Bridge container generates a QR code.

- In the TUI: Select **📱 Setup WhatsApp**.
- Scan the QR code with your phone (Settings → Linked Devices).

### 6. Send Your First Message

Open WhatsApp and send:

```
@fetch hello
```

Fetch should respond with a greeting. Then try:

```
@fetch what projects are in my workspace?
@fetch /status
```

## GitHub Integration (Optional)

If you set `GH_TOKEN` in your `.env`, the Kennel container automatically configures GitHub CLI auth and git identity at startup via its entrypoint script. This enables:

- **`workspace_create`** — Automatically creates a GitHub repo and pushes the initial commit
- **`workspace_sync`** — Commits and pushes changes to the remote

No manual `gh auth login` is needed inside the container.

## Docker Architecture

<!-- DIAGRAM:docker -->

```
docker compose up -d
```

This starts three containers:

| Container | Image | Ports | Volumes |
|-----------|-------|-------|---------|
| `fetch-bridge` | `fetch-app/Dockerfile` | 8765 (status API) | `./data`, `./workspace`, `/var/run/docker.sock` |
| `fetch-kennel` | `kennel/Dockerfile` | — | `./workspace`, `~/.config/gh` (ro), `~/.config/claude-code` (ro), `~/.gemini` (ro) |
| `searxng` | `searxng/searxng:latest` | 8888 (search API) | `./config/searxng` |

The Bridge talks to the Kennel by spawning CLI processes inside it via `docker exec`. Auth credentials are mounted read-only. SearXNG provides the web search backend on the Docker network.

## Pipeline Tuning (Optional)

Fetch's context pipeline has 35 tunable parameters with sane defaults. Override via environment variables for quick adjustments:

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_HISTORY_WINDOW` | `20` | Messages in the LLM sliding window |
| `FETCH_COMPACTION_THRESHOLD` | `40` | Compact when total messages exceed this |
| `FETCH_COMPACTION_MAX_TOKENS` | `500` | Max tokens for compaction summaries |
| `FETCH_MAX_TOOL_CALLS` | `5` | Max tool call rounds per message |

| `FETCH_TOOL_MAX_TOKENS` | `2048` | Token budget for tool-calling responses |
| `FETCH_TOOL_TEMPERATURE` | `0.3` | Temperature for tool-calling responses |

Add these to your `.env` file or use the TUI Manager's **⚙️ Settings** editor (Advanced tab) which shows all pipeline parameters with defaults. See `config/pipeline.ts` for the full list.

## Verifying the Installation

1. **Check container status**: `docker compose ps` — both should be `running`
2. **Check Bridge health**: `curl http://localhost:8765/api/status`
3. **Check logs**: `docker logs fetch-bridge`
4. **Send a test message**: `@fetch ping` on WhatsApp

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code not appearing | Check `docker logs fetch-bridge` — Chromium may need extra deps |
| "Not authorized" response | Verify `OWNER_PHONE_NUMBER` matches your WhatsApp number exactly |
| Harness not found | Ensure the CLI is installed in the Kennel and auth is mounted |
| Container won't start | Check `.env` for syntax errors; run `docker compose logs` |
| WhatsApp disconnects | Fetch auto-reconnects with exponential backoff (up to 10 retries) |

## Updating

Fetch now supports automated updates via the Manager TUI.

1. **Pull changes**:

    ```bash
    git pull
    ```

2. **Launch Manager**:

    ```bash
    cd manager
    ./fetch-manager
    ```

3. **Auto-Update**:
    The Manager will detect the new version and automatically:
    - Install/Update global harness dependencies (Claude, Gemini, etc.).
    - Rebuild Docker containers.
    - Update the internal version state.

You will see a status message: `✅ Harnesses updated to v4.7.0`.
