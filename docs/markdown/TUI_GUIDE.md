# TUI Manager Guide

The Fetch Manager is a terminal user interface (TUI) built with Go and [Bubble Tea](https://github.com/charmbracelet/bubbletea). It provides a graphical way to manage Fetch's Docker services without memorizing commands.

## Building

```bash
cd manager
go build -o fetch-manager .
./fetch-manager
```

Or run directly:

```bash
cd manager && go run .
```

## Screens

### Splash Screen

On launch, a 2-second splash screen shows the Fetch ASCII mascot and version. It automatically transitions to the main menu.

### Main Menu

The main menu shows the Fetch mascot on the left and a navigable menu on the right. A status bar at the bottom shows container states (Bridge and Kennel running/stopped).

**Menu Items:**

| Key | Option | Description |
|-----|--------|-------------|
| ↑/↓ | Navigate | Move cursor between options |
| Enter | Select | Activate the selected option |
| q/Esc | Quit | Exit the TUI |

| Option | Action |
|--------|--------|
| 📱 Setup WhatsApp | Opens the QR code scanner for WhatsApp authentication |
| 🔌 Disconnect WhatsApp | Calls the Bridge `/api/logout` endpoint to disconnect |
| 🚀 Start Fetch | Runs `docker compose up -d --build` to start both containers |
| 🛑 Stop Fetch | Runs `docker compose down` to stop services |
| ⚙️ Configure | Opens the `.env` file editor |
| 🔐 Trusted Numbers | Manage the phone number whitelist (`data/whitelist.json`) |
| 🤖 Select Model | Browse and select an AI model from OpenRouter |
| 📜 View Logs | Stream live container logs |
| 📚 Documentation | Opens the docs site in your browser |
| ℹ️ Version | Shows system version info (neofetch-style) |
| ❌ Exit | Quit the TUI |

### WhatsApp Setup

Shows the QR code rendered directly in the terminal using Unicode block characters. Includes a countdown timer — WhatsApp QR codes expire after ~20 seconds, so the TUI auto-refreshes.

**States:**
- **Waiting for QR** — Fetching from Bridge API
- **QR Displayed** — Scan with WhatsApp
- **Connected** — Authentication successful

Press `Esc` or `b` to return to the main menu.

### Configuration Editor

Edits the `.env` file with a form interface. Fields:

| Field | Key | Description |
|-------|-----|-------------|
| Phone Number | `OWNER_PHONE_NUMBER` | Your WhatsApp number |
| API Key | `OPENROUTER_API_KEY` | OpenRouter key (masked) |
| Claude Harness | `ENABLE_CLAUDE` | Enable/disable Claude Code |
| Gemini Harness | `ENABLE_GEMINI` | Enable/disable Gemini CLI |
| Copilot Harness | `ENABLE_COPILOT` | Enable/disable Copilot |
| Model | `AGENT_MODEL` | Default LLM model |
| Log Level | `LOG_LEVEL` | Minimum log severity |
| Timezone | `TZ` | Container timezone |

**Controls:** `Tab`/`Shift+Tab` to move between fields, `Enter` to edit, `s` to save, `Esc` to cancel.

### Trusted Numbers Manager

Manages `data/whitelist.json` — the list of phone numbers allowed to use `@fetch` besides the owner.

**Controls:** `a` to add a number, `d` to delete selected, `↑/↓` to navigate, `Esc` to go back.

### Model Selector

Fetches available models from the OpenRouter API and displays them in categorized lists (Flagship, Mid-Range, Fast, Specialized). Shows pricing per million tokens and highlights the currently selected model.

**Controls:** `↑/↓` to browse, `Enter` to select, `Tab` to switch categories, `Esc` to go back.

### Log Viewer

Streams live logs from both Docker containers (`fetch-bridge` and `fetch-kennel`) in real-time.

**Controls:** Scroll with `↑/↓`, `Esc` to return to menu.

### Version Screen

Shows system information in a neofetch-style layout: Fetch version, Go version, Node.js version, Docker version, OS, and container statuses.

## Keyboard Shortcuts (Global)

| Key | Action |
|-----|--------|
| `q`, `Esc` | Go back / quit |
| `↑`, `k` | Move up |
| `↓`, `j` | Move down |
| `Enter` | Select / confirm |
| `v` | Version info (from menu) |
| `Ctrl+C` | Force quit |

## How It Works

The Manager is a standalone Go binary that:

1. Reads/writes the `.env` file directly
2. Calls `docker compose` commands via `os/exec`
3. Polls the Bridge status API (`http://localhost:8765/api/status`) for health checks
4. Renders QR codes using the `go-qrcode` library
5. Uses Lipgloss for styled terminal rendering with custom themes

It does not communicate with the Bridge beyond the HTTP status API and Docker container management.
