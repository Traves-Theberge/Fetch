# TUI Manager Guide

The Fetch Manager is a terminal user interface (TUI) built with Go and [Bubble Tea](https://github.com/charmbracelet/bubbletea). It provides a graphical way to manage Fetch's Docker services, authenticate AI harnesses, edit configuration, and monitor logs — without memorizing commands.

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
| `Enter` or `Space` | Activate the selected option |
| `q` or `Ctrl+C` | Exit the TUI |

**Menu Items:**

| Option | Badge | Action |
|--------|-------|--------|
| 🚀 Start Fetch | `[Running]` / `[Partial]` / `[Stopped]` | Runs `docker compose up -d --build` to start containers |
| 🛑 Stop Fetch | — | Runs `docker compose down` to stop services |
| 🔄 Update Fetch | — | Runs `fetch self update` in-process, then exits TUI on success (relaunch with `fetch tui`) |
| 📱 Setup WhatsApp | — | Opens the QR code scanner for WhatsApp authentication |
| 📄 View Logs | — | Stream live container logs |
| 📚 Documentation | — | Opens the docs site in your browser |
| ⚙️ Settings | `[X/5 auth]` | General config, harness auth/config, trusted numbers |
| 💬 Global Sessions | — | View and manage persisted conversation sessions |
| ℹ️ Version | — | Shows system version info (neofetch-style) |
| ❌ Exit | — | Quit the TUI |

Badges update in real-time based on container status and harness authentication state.

---

### WhatsApp Setup

Shows the QR code rendered directly in the terminal using Unicode block characters. Includes a countdown timer — WhatsApp QR codes expire after ~20 seconds, so the TUI auto-refreshes.

**Why:** WhatsApp requires a one-time QR scan to link Fetch as a paired device. This screen handles that flow without needing `docker logs`.

**States:**

| State | What happens |
|-------|--------------|
| Waiting for QR | Fetching QR data from the Bridge status API |
| QR Displayed | Scan with WhatsApp (Settings → Linked Devices → Link a Device) |
| Connected | Authentication successful, session persisted to `./data/.wwebjs_auth/` |
| Error | Bridge unreachable or Chromium startup issue |

**Controls:**

| Key | Action |
|-----|--------|
| `o` | Open QR code in browser (alternative scan method) |
| `Esc` | Return to main menu |

The session persists across restarts. You only need to scan once unless you manually log out.

---

### Harnesses

The unified management screen for all 5 AI CLI harnesses. Each harness shows its authentication status, enable/disable state, API key, and model — all editable from one place.

**Why:** Each AI CLI (GitHub/Copilot, Claude Code, Gemini, OpenCode, Codex) needs host-level authentication, an enable flag, and optionally an API key and model override. This screen lets you manage everything per-harness instead of hunting through separate screens.

**How it works:** When you press `l` to login, the TUI suspends and the selected CLI's interactive login process takes over the terminal (browser OAuth flow, device codes, etc.). When the CLI finishes, the TUI resumes and refreshes the status. Config changes (enable, API key, model) are saved to `.env` immediately.

**Layout:**

Each harness is shown as a row with icon, name, auth status, and enable badge. The selected harness expands to show config fields:

```
 ▸ 💻 GitHub (Copilot)  ● Authenticated     ✓ Enabled
      github.com/youruser
      Token: ••••••••••••••••
      Model: (default)

   🧠 Claude Code       ○ Not Authenticated  ✗ Disabled

   ✨ Gemini CLI         ◌ Not Installed       ✗ Disabled

   🔧 OpenCode           ● Authenticated     ✓ Enabled
      ~/.local/share/opencode/auth.json
      API Key: ••••••••••••••••
      Model: (default)

   🤖 Codex              ○ Not Authenticated  ✗ Disabled
```

**Status badges:**

| Badge | Meaning |
|-------|---------|
| `● Authenticated` (green) | CLI is installed and credentials are present |
| `○ Not Authenticated` (red) | CLI is installed but no credentials found |
| `◌ Not Installed` (muted) | CLI binary not found on the host PATH |
| `✓ Enabled` (green) | Harness is enabled in `.env` |
| `✗ Disabled` (muted) | Harness is disabled |

**Status detection methods:**

| Harness | How auth is detected |
|---------|---------------------|
| GitHub (Copilot) | Parses output of `gh auth status` for logged-in accounts |
| Claude Code | Checks file existence: `~/.claude/.credentials.json` |
| Gemini CLI | Checks file existence: `~/.gemini/oauth_creds.json` |
| OpenCode | Runs `opencode auth list`, checks for non-empty output |
| Codex | Runs `codex login status`, checks exit code |

**Config key mapping:**

| Harness | Enable Key | API Key | Model Key |
|---------|-----------|---------|-----------|
| GitHub (Copilot) | `ENABLE_COPILOT` | `GH_TOKEN` | `COPILOT_MODEL` |
| Claude Code | `ENABLE_CLAUDE` | `ANTHROPIC_API_KEY` | `CLAUDE_MODEL` |
| Gemini CLI | `ENABLE_GEMINI` | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| OpenCode | `ENABLE_OPENCODE` | `OPENCODE_API_KEY` | `OPENCODE_MODEL` |
| Codex | `ENABLE_CODEX` | `CODEX_API_KEY` | `CODEX_MODEL` |

**Controls:**

| Key | Action |
|-----|--------|
| `↑`/`↓` or `k`/`j` | Navigate between harnesses |
| `e` | Toggle enable/disable for selected harness |
| `a` | Edit API key for selected harness |
| `m` | Edit model for selected harness |
| `l` | Login the selected harness (launches interactive CLI) |
| `d` | Logout the selected harness |
| `r` | Refresh all harness statuses and config |
| `Esc` | Return to main menu |

**Edit mode** (when editing API key or model):

| Key | Action |
|-----|--------|
| Characters | Type value |
| `Backspace` | Delete last character |
| `Enter` | Save value to `.env` |
| `Esc` | Cancel editing |

**GitHub-specific controls** (only available when GitHub is selected):

| Key | Action |
|-----|--------|
| `←`/`→` or `h`/`Tab` | Navigate between GitHub sub-accounts |
| `s` | Switch active GitHub account |
| `l` | Add a new GitHub account |
| `d` | Remove the selected GitHub account |

GitHub supports multiple authenticated accounts. When GitHub is selected, the row expands to show all accounts with an `(active)` badge on the current one. Use `s` to switch which account is active.

**Docker credential mounts:** The Kennel container mounts host credential directories read-only so the AI CLIs can access your authentication:

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `~/.config/gh/` | `/root/.config/gh/` | GitHub CLI credentials |
| `~/.config/claude-code/` | `/root/.config/claude-code/` | Claude Code config |
| `~/.claude/` | `/root/.claude/` | Claude OAuth tokens |
| `~/.gemini/` | `/root/.gemini/` | Gemini credentials |
| `~/.config/opencode/` | `/root/.config/opencode/` | OpenCode credentials |
| `~/.codex/` | `/root/.codex/` | Codex OAuth tokens |

> **Note:** You can authenticate harnesses via API keys instead of OAuth login by setting the key directly in this screen (press `a`). API keys use per-call billing; OAuth login uses your subscription.

---

### Settings

Edits the `.env` file with a scrollable form interface. The Settings screen has two tabs: **General** (essentials) and **Advanced** (pipeline tuning). Switch between tabs with `←`/`→` arrow keys.

**Why:** Fetch has 40+ tunable parameters. General settings cover the essentials you'll configure once. Advanced settings expose the full pipeline for fine-tuning — most users never need to change these.

**How it works:** The editor reads the current `.env` file, shows each parameter with its current value (or a dimmed default), and writes changes back when you save. Saving automatically restarts the `fetch-bridge` container to apply changes.

**General tab fields:**

| Field | Key | Default |
|-------|-----|---------|
| Owner Phone | `OWNER_PHONE_NUMBER` | — |
| OpenRouter Key | `OPENROUTER_API_KEY` | — |
| Agent Model | `AGENT_MODEL` | `openai/gpt-4o-mini` |
| Log Level | `LOG_LEVEL` | `info` |
| Timezone | `TZ` | `UTC` |

**Advanced tab groups:**

| Group | Parameters | Examples |
|-------|-----------|----------|
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
| **Web / Browser** | 6 | Enable Web Fetch, SearXNG URL, Browser Timeout |

**Field types:**

- **Text fields** — Type a value, displayed with a text cursor
- **Toggle fields** — `ENABLE_*` flags shown as `[✓]`/`[ ]`, toggled with `Enter`
- **Masked fields** — API keys shown as `••••••` for security

**Controls:**

| Key | Action |
|-----|--------|
| `←`/`→` | Switch between General and Advanced tabs |
| `↑`/`↓` | Navigate between parameters |
| `Enter` | Edit the focused field (or open model picker for Agent Model, or toggle for boolean fields) |
| `Tab` | Open section picker (jump to a section by number) |
| `s` | Save all changes to `.env` and restart fetch-bridge |
| `Esc` | Discard changes and return to main menu |

**Features:**

- Default values shown in dim text when a field is empty
- Help text displayed below the focused field
- Scroll indicators when the list overflows
- **Agent Model** field opens the model selector overlay on `Enter`
- Section picker overlay for quick navigation in the Advanced tab

> **Tip:** When you press `s` to save, the Manager automatically restarts the `fetch-bridge` service so your changes take effect immediately.

---

### Model Selector (Agent Model Overlay)

When you press `Enter` on the **Agent Model** field in the Settings screen, a model selector overlay appears.

**Why:** OpenRouter provides access to hundreds of models. This overlay helps you pick the right one by showing capabilities, pricing, and context window sizes.

**How it works:** It fetches the model list from the OpenRouter API and displays them grouped by provider.

**Each model entry shows:**

- **Context window** size
- **Pricing** per million tokens
- **Modality** badges (text, image, audio)
- **🔧 Tools** badge for function-calling capable models

By default, only tool-capable models are shown (Fetch requires function calling).

**Controls:**

| Key | Action |
|-----|--------|
| `↑`/`↓` | Browse models |
| `Enter` | Select model and save to config |
| `Tab` | Toggle between all models and tool-capable only |
| `Esc` | Return to config editor without selecting |

---

### Trusted Numbers Manager

Manages `data/whitelist.json` — the list of phone numbers allowed to use `@fetch` besides the owner.

**Why:** By default, only the `OWNER_PHONE_NUMBER` can interact with Fetch. This screen lets you add trusted users who can also send commands.

**How it works:** Numbers are stored in `data/whitelist.json`. The Bridge watches this file via chokidar and hot-reloads changes — numbers added here take effect immediately without restarting. You can also manage trusted numbers via WhatsApp using the `/trust` command.

**Controls:**

| Key | Action |
|-----|--------|
| `↑`/`↓` | Navigate the number list |
| `a` | Add a new phone number |
| `d` | Delete the selected number |
| `r` | Refresh the list from disk |
| `Esc` | Return to main menu |

---

---

### Session History

Allows you to browse past conversation histories, view full message transcripts, and manage session lifecycle.

**Why:** Reviewing past tasks or cleaning up old sessions is essential for maintaining an organized workspace.

**Controls (Session List):**

| Key | Action |
| --- | --- |
| `↑`/`↓` | Navigate session list |
| `Enter` | View full message history for selected session |
| `d` | Delete the selected session |
| `C` | Clear ALL session history (requires confirmation) |
| `Esc` | Return to main menu |

**Controls (Message History):**

| Key | Action |
|-----|--------|
| `↑`/`↓` | Scroll through messages |
| `PgUp`/`PgDn` | Scroll by page |
| `Home`/`End` | Jump to top/bottom |
| `w` | Toggle word wrap |
| `r` | Toggle raw/JSON mode (copyable) |
| `c` | Copy selected message to clipboard |
| `C` | Copy ALL messages in session to clipboard |
| `Esc` | Return to session list |

**Message Style:**
Session history uses the same robust engine as the live Log Viewer:

- **👤 USER**: Primary theme color (Bold)
- **🐕 ASSISTANT**: Secondary theme color (Bold)
- **🛠️ TOOL**: Muted theme color with italic formatting
- **Timestamp**: Each message is timestamped for tracking conversation flow

---

### Log Viewer

Streams logs from the `fetch-bridge` container with parsed color-coded output.

**Why:** Lets you monitor Fetch activity in real-time — message processing, tool calls, harness execution, errors — without running `docker logs` manually.

**Controls:**

| Key | Action |
|-----|--------|
| `↑`/`↓` | Scroll through log output |
| `PgUp`/`PgDn` | Scroll by half-page |
| `Home`/`End` | Jump to top/bottom |
| `w` | Toggle word wrap |
| `r` | Toggle raw mode (raw JSON strings) |
| `c` | Copy selected line |
| `C` | Copy all visible logs |
| `x` | Clear current log buffer |
| `Esc` | Return to main menu |

---

### System Status

Shows the current state of Docker containers.

**Why:** Quick health check to verify both Bridge and Kennel are running.

**Display:**

- **Bridge (WhatsApp)** — Running/Stopped indicator
- **Kennel (AI Agents)** — Running/Stopped indicator

**Controls:**

| Key | Action |
|-----|--------|
| `r` | Refresh container statuses |
| `Esc` | Return to main menu |

---

### Version Screen

Shows system information in a neofetch-style layout with the Fetch mascot.

**Display:** Fetch version, Go version, Node.js version, Docker version, OS, and container statuses.

Press `Esc` to return to the main menu.

---

## Keyboard Shortcuts (Global)

These keys work on every screen:

| Key | Action |
|-----|--------|
| `Esc` | Go back to previous screen |
| `↑`, `k` | Move up |
| `↓`, `j` | Move down |
| `Enter` | Select / confirm |
| `q` | Quit (from main menu) |
| `Ctrl+C` | Force quit |

## How It Works

The Manager is a standalone Go binary that:

1. Reads/writes the `.env` file directly
2. Calls `docker compose` commands via `os/exec`
3. Polls the Bridge status API (`http://localhost:8765/api/status`) for health checks
4. Renders QR codes using the `go-qrcode` library
5. Runs CLI login commands via `tea.ExecProcess` (temporarily yields the terminal to the CLI process)
6. Detects harness installation via `exec.LookPath` and credential files on the host filesystem
7. Uses Lipgloss for styled terminal rendering with custom themes

It does not communicate with the Bridge beyond the HTTP status API and Docker container management.

## Auto-Update & Hot-Reload

Fetch includes automated lifecycle management:

### Auto-Update

On startup, the Manager checks the installed version against the project's `VERSION` file. If a mismatch is detected (e.g., after `git pull`), it automatically:

1. Installs or updates global AI CLI tools (Claude, Gemini, OpenCode, Codex).
2. Rebuilds Docker containers to ensure they match the code.
3. Updates the internal version record.

### Hot-Reload

When you save changes in the **⚙️ Settings** screen:

1. The `.env` file is updated immediately.
2. The `fetch-bridge` container is automatically restarted to apply the new configuration.
3. The TUI remains active, so you can continue managing the system while the backend reloads.
