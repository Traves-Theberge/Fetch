# TUI Manager Guide

The Fetch Manager is a terminal user interface (TUI) built with Go and [Bubble Tea](https://github.com/charmbracelet/bubbletea). It provides a graphical way to manage Fetch's Docker services without memorizing commands.

## Building

```bash
cd manager
go build -o fetch-manager .
./fetch-manager
```

Or install globally:

```bash
cd manager && go build -o fetch-manager . && sudo cp fetch-manager /usr/local/bin/fetch
fetch
```

## Screens

### Splash Screen

On launch, a 2-second splash screen shows the Fetch ASCII mascot and version. It automatically transitions to the main menu.

### Main Menu

The main menu shows the Fetch mascot on the left and a navigable menu on the right. A status bar at the bottom shows container states (Bridge and Kennel running/stopped).

**Navigation:**

| Key | Action |
|-----|--------|
| `↑`/`↓` or `k`/`j` | Move cursor between options |
| `Enter` | Activate the selected option |
| `q` or `Ctrl+C` | Exit the TUI |

**Menu Items:**

| Option | Action |
|--------|--------|
| 📱 Setup WhatsApp | Opens the QR code scanner for WhatsApp authentication |
| 🔑 GitHub Auth | Runs `gh auth login` interactively (TUI suspends, CLI takes over, TUI resumes) |
| 🚀 Start Fetch | Runs `docker compose up -d --build` to start both containers |
| 🛑 Stop Fetch | Runs `docker compose down` to stop services |
| ⚙️ Configure | Opens the configuration editor (all 44 parameters) |
| 🔐 Trusted Numbers | Manage the phone number whitelist (`data/whitelist.json`) |
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

Press `Esc` to return to the main menu.

### GitHub Auth

Temporarily suspends the TUI and runs `gh auth login` in the terminal. The GitHub CLI handles the full OAuth device flow (opens a browser, waits for authentication, saves credentials to `~/.config/gh/hosts.json`). When complete, the TUI resumes automatically. The Kennel container mounts `~/.config/gh` read-only for Copilot access.

### Configuration Editor

Edits the `.env` file with a scrollable form interface organized into **10 subsystem groups**:

| Group | Parameters | Examples |
|-------|-----------|----------|
| **Core Settings** | 8 | Owner Phone, API Key, Agent Model, Log Level |
| **Context Window** | 4 | History Window, Compaction Threshold |
| **Agent LLM** | 6 | Chat/Tool Max Tokens, Temperature |
| **Circuit Breaker** | 5 | CB Threshold, Backoff, Retries |
| **Task Execution** | 3 | Task/Harness Timeout |
| **WhatsApp Formatting** | 2 | Max Length, Line Width |
| **Rate Limiting** | 2 | Rate Limit Max, Window |
| **Bridge / Reconnection** | 6 | Reconnect delays, Dedup TTL |
| **Session / Memory** | 3 | Recent Msg Limit, Truncation |
| **Workspace** | 2 | Cache TTL, Git Timeout |
| **BM25 Memory** | 3 | Recall Limit, Snippet Tokens, Decay |

**Features:**
- Default values shown in dim text when a field is empty
- Help text displayed below the focused field
- Scroll indicators when the list overflows
- **Agent Model** field opens the model selector overlay on `Enter`

**Controls:** `↑`/`↓` to navigate, `Enter` to edit (or open model picker for Agent Model), `s` to save, `Esc` to go back.

### Model Selector (Agent Model Overlay)

When you press `Enter` on the **Agent Model** field in the configuration editor, a model selector overlay appears. It fetches models from the OpenRouter API and displays them grouped by provider with:

- **Context window** size
- **Pricing** per million tokens
- **Modality** badges (text, image, audio)
- **🔧 Tools** badge for function-calling capable models

By default, only tool-capable models are shown. Press `Tab` to toggle between all models and tool-capable only.

**Controls:** `↑`/`↓` to browse, `Enter` to select and save, `Tab` to toggle filter, `Esc` to return to config editor.

### Trusted Numbers Manager

Manages `data/whitelist.json` — the list of phone numbers allowed to use `@fetch` besides the owner.

**Controls:** `a` to add a number, `d` to delete selected, `↑`/`↓` to navigate, `Esc` to go back.

### Log Viewer

Streams logs from the `fetch-bridge` container with parsed color-coded output.

**Controls:** Scroll with `↑`/`↓`, `Esc` to return to menu.

### Version Screen

Shows system information in a neofetch-style layout: Fetch version, Go version, Node.js version, Docker version, OS, and container statuses.

## Keyboard Shortcuts (Global)

| Key | Action |
|-----|--------|
| `q`, `Esc` | Go back / quit |
| `↑`, `k` | Move up |
| `↓`, `j` | Move down |
| `Enter` | Select / confirm |
| `Ctrl+C` | Force quit |

## How It Works

The Manager is a standalone Go binary that:

1. Reads/writes the `.env` file directly
2. Calls `docker compose` commands via `os/exec`
3. Polls the Bridge status API (`http://localhost:8765/api/status`) for health checks
4. Renders QR codes using the `go-qrcode` library
5. Runs `gh auth login` via `tea.ExecProcess` (temporarily yields the terminal)
6. Uses Lipgloss for styled terminal rendering with custom themes

It does not communicate with the Bridge beyond the HTTP status API and Docker container management.
