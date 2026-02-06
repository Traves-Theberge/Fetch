# Setup Guide

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Linux host | Any distro | Host machine |
| Docker + Docker Compose | Latest | Container runtime |
| Go | 1.21+ | Build the Manager TUI |
| Node.js | 20+ | Development only (not needed for Docker) |
| OpenRouter API key | — | LLM access ([openrouter.ai](https://openrouter.ai)) |

You also need at least one AI CLI authenticated on your host:

- **Claude Code**: `claude` CLI with active session
- **Gemini CLI**: `gemini` CLI with API key in `~/.gemini/`
- **GitHub Copilot**: `gh auth login` completed, hosts file at `~/.config/gh/`

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
OWNER_PHONE_NUMBER=15551234567
OPENROUTER_API_KEY=sk-or-...
```

See [Configuration](CONFIGURATION.md) for all environment variables.

### 3. Start with the TUI Manager

```bash
cd manager
go build -o fetch-manager .
./fetch-manager
```

The TUI will launch with a splash screen, then show the main menu. Select **🚀 Start Fetch** to build and launch the Docker containers.

See [TUI Guide](TUI_GUIDE.md) for full Manager documentation.

### 4. Start without the TUI (Alternative)

```bash
docker compose up -d
docker logs -f fetch-bridge
```

### 5. Authenticate WhatsApp

On first launch, the Bridge container prints a QR code to the terminal. Scan it with WhatsApp (Settings → Linked Devices → Link a Device).

If using the TUI, select **📱 Setup WhatsApp** — it shows the QR code directly in the terminal with an auto-refresh timer.

The session persists in `./data/.wwebjs_auth/`. You only need to scan once unless you log out.

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

## Docker Architecture

```
docker compose up -d
```

This starts two containers:

| Container | Image | Ports | Volumes |
|-----------|-------|-------|---------|
| `fetch-bridge` | `fetch-app/Dockerfile` | 8765 (status API) | `./data`, `./workspace`, `/var/run/docker.sock` |
| `fetch-kennel` | `kennel/Dockerfile` | — | `./workspace`, `~/.config/gh` (ro), `~/.config/claude-code` (ro), `~/.gemini` (ro) |

The Bridge talks to the Kennel by spawning CLI processes inside it via `docker exec`. Auth credentials are mounted read-only.

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

```bash
git pull
docker compose build
docker compose up -d
```

Or use the TUI Manager's built-in update option if available.
