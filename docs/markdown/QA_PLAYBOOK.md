# QA Playbook — Hands-On Testing

A practical test checklist for verifying Fetch works end-to-end. Every test case is something you can do right now via WhatsApp, curl, or the TUI.

**Prerequisites:**
- Both containers running (`docker compose up -d`)
- WhatsApp linked (QR scanned, bridge authenticated)
- At least one workspace in the Kennel (`/projects` returns results)
- Your phone number set as `OWNER_PHONE_NUMBER` in `.env`

---

## 1. Smoke Test — Is It Alive?

Run these first. If any fail, stop and fix before continuing.

| # | Test | How | Expected |
|---|------|-----|----------|
| 1.1 | Bridge health | `curl http://localhost:8765/api/health` | `{"status":"ok"}` |
| 1.2 | Bridge status | `curl http://localhost:8765/api/status` | JSON with `state: "authenticated"`, uptime, version `3.3.0` |
| 1.3 | Docs site | Open `http://localhost:8765/docs/` in browser | Documentation site loads |
| 1.4 | TUI launches | Run `fetch` in terminal | Splash screen → main menu |
| 1.5 | WhatsApp responds | Send `@fetch /version` | `🤖 Fetch v3.3.0 (Deep Refinement)` |
| 1.6 | Help works | Send `@fetch /help` | Full command list returned |

---

## 2. Security Gate

Test that unauthorized access is blocked and authorized access works.

| # | Test | How | Expected |
|---|------|-----|----------|
| 2.1 | Owner with prefix | Send `@fetch hello` from your phone | Response (greeting) |
| 2.2 | Owner without prefix | Send `hello` (no `@fetch`) in a DM | **Silently ignored** — no response |
| 2.3 | Case insensitivity | Send `@FETCH /version` | Works — returns version |
| 2.4 | Untrusted sender | Have someone not in your whitelist send `@fetch hello` | **No response** (silent drop) |
| 2.5 | Trust add | Send `@fetch /trust add <phone>` | Confirmation: number added |
| 2.6 | Trust list | Send `@fetch /trust list` | Shows whitelisted numbers |
| 2.7 | Trust remove | Send `@fetch /trust remove <phone>` | Confirmation: number removed |
| 2.8 | Group without mention | Post a message in a group without `@fetch` | **Ignored** |
| 2.9 | Group with mention | Post `@fetch /status` in a group | Response in group |
| 2.10 | Rate limiting | Send 31+ messages rapidly in under 60 seconds | Messages after the 30th should be dropped |

---

## 3. Slash Commands — Core

Test every command category. Each test is a single WhatsApp message.

### Workspace Commands

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.1 | List projects | `@fetch /projects` | Lists workspace directories |
| 3.2 | List alias | `@fetch /ls` | Same result as `/projects` |
| 3.3 | Select project | `@fetch /project <name>` | Confirms switch, shows project info |
| 3.4 | Select no arg | `@fetch /project` | Shows current project or "No project selected" |
| 3.5 | Status | `@fetch /status` | Mode, workspace, active task, git state |
| 3.6 | Status alias | `@fetch /st` | Same as `/status` |
| 3.7 | Git status | `@fetch /gs` | Git branch, modified/staged/untracked files |
| 3.8 | Git diff | `@fetch /diff` | Shows uncommitted changes (or "clean") |
| 3.9 | Git log | `@fetch /log` | Last 10 commits |
| 3.10 | Git log N | `@fetch /log 3` | Last 3 commits |
| 3.11 | Clone repo | `@fetch /clone https://github.com/user/repo` | Clones into workspace, confirms |
| 3.12 | Init project | `@fetch /init my-test-app` | Creates scaffolded project |

### Session Commands

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.13 | Thread info | `@fetch /thread` | Current thread name/ID |
| 3.14 | Thread list | `@fetch /thread list` | All threads with message counts |
| 3.15 | New thread | `@fetch /thread new my-thread` | Creates thread, switches to it |
| 3.16 | Switch thread | `@fetch /thread switch my-thread` | Switches, shows restored context |
| 3.17 | Clear session | `@fetch /clear` | Clears history, confirms reset |
| 3.18 | Clear alias | `@fetch /reset` | Same as `/clear` |

### Preference Commands

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.19 | Check mode | `@fetch /mode` | Shows current autonomy level |
| 3.20 | Set supervised | `@fetch /mode supervised` | Confirms: supervised mode |
| 3.21 | Set cautious | `@fetch /mode cautious` | Confirms: cautious mode |
| 3.22 | Set autonomous | `@fetch /mode autonomous` | Confirms: autonomous mode |
| 3.23 | Toggle auto | `@fetch /auto` | Toggles auto-approve on/off |
| 3.24 | Toggle verbose | `@fetch /verbose` | Toggles verbose output |
| 3.25 | Toggle autocommit | `@fetch /autocommit` | Toggles auto-commit |

### Context Commands

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.26 | Add file | `@fetch /context add src/index.ts` | File added to active context |
| 3.27 | List context | `@fetch /context list` | Shows all tracked files |
| 3.28 | Remove file | `@fetch /context remove src/index.ts` | File removed |
| 3.29 | Context alias | `@fetch /ctx list` | Same as `/context list` |

### Identity & Skills

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.30 | Identity | `@fetch /identity` | Shows loaded collar sections |
| 3.31 | Identity section | `@fetch /identity personality` | Shows specific section |
| 3.32 | Identity reload | `@fetch /identity reset` | Reloads from disk, confirms |
| 3.33 | Skill list | `@fetch /skills` | Lists all skills with enabled/disabled |
| 3.34 | Enable skill | `@fetch /skill enable <name>` | Skill enabled |
| 3.35 | Disable skill | `@fetch /skill disable <name>` | Skill disabled |

### Scheduling

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.36 | Set reminder | `@fetch /remind 1m test reminder` | Confirms reminder set |
| 3.37 | Reminder fires | Wait 1 minute | Receives reminder message |
| 3.38 | Schedule cron | `@fetch /schedule "*/5 * * * *" check status` | Cron job created |
| 3.39 | List cron | `@fetch /cron list` | Shows scheduled jobs |
| 3.40 | Remove cron | `@fetch /cron remove <id>` | Job removed |

### Edge Cases

| # | Test | Send | Expected |
|---|------|------|----------|
| 3.41 | Unknown command | `@fetch /gibberish` | "Unknown command" + suggests `/help` |
| 3.42 | Empty slash | `@fetch /` | Unknown command response |
| 3.43 | Extra whitespace | `@fetch  /status` | Still works (prefix stripped) |
| 3.44 | Version alias | `@fetch /v` | Same as `/version` |

---

## 4. Natural Language — Intent Classification

Test that Fetch correctly routes natural language to conversation, action, or clarify.

### Conversation Intent

| # | Test | Send | Expected |
|---|------|------|----------|
| 4.1 | Greeting | `@fetch hello` | Friendly greeting response |
| 4.2 | Thanks | `@fetch good job` | Acknowledgment |
| 4.3 | Farewell | `@fetch bye` | Farewell response |
| 4.4 | Help | `@fetch what can you do?` | Capability explanation |
| 4.5 | Reaction | `@fetch ok` | Short acknowledgment |
| 4.6 | Concept question | `@fetch what is a promise in JavaScript?` | Conversational explanation (no task created) |
| 4.7 | Short message | `@fetch cool` | Treated as conversation, not action |

### Action Intent — Workspace

| # | Test | Send | Expected |
|---|------|------|----------|
| 4.8 | List workspaces | `@fetch what projects do I have?` | Calls `list_workspaces` tool, returns list |
| 4.9 | Switch workspace | `@fetch switch to my-app` | Calls `select_workspace`, confirms switch |
| 4.10 | Create workspace | `@fetch create a new project called test-app` | Calls `create_workspace`, scaffolds it |
| 4.11 | Workspace status | `@fetch what's changed?` | Calls `get_status`, shows git state |
| 4.12 | Where am I | `@fetch where am I?` | Shows current project context |

### Action Intent — Tasks

These create actual coding tasks routed to a harness (Claude/Gemini/Copilot).

| # | Test | Send | Expected |
|---|------|------|----------|
| 4.13 | Create feature | `@fetch add a health check endpoint to the API` | 🔵 WORKING mode, task created, harness invoked |
| 4.14 | Fix bug | `@fetch fix the TypeScript error in utils.ts` | Task created with modify intent |
| 4.15 | Refactor | `@fetch refactor the auth module into smaller files` | Routed to Claude (complex task) |
| 4.16 | Write tests | `@fetch write unit tests for the session manager` | Task created, routed to Claude |
| 4.17 | Explain code | `@fetch what does the intent classifier do?` | Code explanation (may not create task) |
| 4.18 | Debug | `@fetch why is the build failing?` | Debug task created |

### Destructive Intent — GUARDING Mode

| # | Test | Send | Expected |
|---|------|------|----------|
| 4.19 | Delete request | `@fetch delete the old API routes` | 🔴 GUARDING mode — asks for explicit confirmation |
| 4.20 | Confirm yes | Reply `yes` | Proceeds with destructive task |
| 4.21 | Confirm no | Reply `no` | Cancels, returns to normal |

### Clarify Intent

| # | Test | Send | Expected |
|---|------|------|----------|
| 4.22 | Ambiguous (no task) | `@fetch fix it` (with no active task) | Asks for clarification: "What should I fix?" |
| 4.23 | Ambiguous (no task) | `@fetch broken` | Asks what's broken |
| 4.24 | Ambiguous (with task) | Start a task, then send `@fetch fix it` | Treated as continuation of active task |

---

## 5. Harness Routing

Test that tasks go to the right AI harness.

| # | Test | Send | Expected Harness |
|---|------|------|-----------------|
| 5.1 | Default routing | `@fetch add a login form` | Claude (default for code tasks) |
| 5.2 | Force Claude | `@fetch use claude: refactor the auth` | Claude |
| 5.3 | Force Gemini | `@fetch use gemini: explain this function` | Gemini |
| 5.4 | Force Copilot | `@fetch use copilot: git command for squash` | Copilot |
| 5.5 | Auto refactor | `@fetch restructure the module layout` | Claude (refactor signal) |
| 5.6 | Auto quick fix | `@fetch fix the typo in readme` | Gemini (quick fix signal) |
| 5.7 | Auto git task | `@fetch create a PR template` | Copilot (GitHub signal) |
| 5.8 | Invalid harness | `@fetch use gpt4: do something` | Should fall back or error gracefully |

**Verification:** Check `/status` during a task — it shows which harness is active.

---

## 6. Task Lifecycle

Test the full task state machine: pending → running → completed/failed/cancelled.

| # | Test | How | Expected |
|---|------|-----|----------|
| 6.1 | Create task | Send a coding request | Task moves to `pending` then `running` |
| 6.2 | Check task | `@fetch /task` during execution | Shows task ID, state, elapsed time |
| 6.3 | Task completes | Wait for harness to finish | 🟢 completion message with summary |
| 6.4 | Cancel running | `@fetch /stop` while task is running | Task cancelled, confirmed |
| 6.5 | Pause task | `@fetch /pause` during execution | Task paused |
| 6.6 | Resume task | `@fetch /resume` after pause | Task resumes |
| 6.7 | Double task | Send a new request while one is running | Error: "A task is already running" |
| 6.8 | Task timeout | Send a task that takes >5 min | Timeout error reported |
| 6.9 | Waiting input | Harness asks a question during task | 🟡 WAITING mode — relays question to you |
| 6.10 | Answer input | Reply to the question | Answer forwarded to harness, task resumes |

---

## 7. Media Handling

### Voice Notes

| # | Test | How | Expected |
|---|------|-----|----------|
| 7.1 | Voice transcription | Send a voice note saying `@fetch hello what can you do?` | Transcribed text appears, Fetch responds as conversation |
| 7.2 | Voice command | Record voice saying `@fetch list my projects` | Transcribed → parsed → executes `/projects` equivalent |
| 7.3 | Voice task | Record voice saying `@fetch add a dark mode toggle` | Transcribed → creates coding task |
| 7.4 | Short voice | Send a 1-second voice clip | Should still transcribe (may be empty) |
| 7.5 | Long voice | Send a 2+ minute voice note | Should transcribe within 60s timeout |

### Images

| # | Test | How | Expected |
|---|------|-----|----------|
| 7.6 | Code screenshot | Send a screenshot of code with caption `@fetch what's wrong here?` | Analyzes code, identifies issues |
| 7.7 | UI screenshot | Send a UI mockup with `@fetch describe this layout` | Returns CSS/layout description |
| 7.8 | Error screenshot | Send a screenshot of an error message | Transcribes error text, suggests fix |
| 7.9 | Image no caption | Send an image without `@fetch` caption | Silently ignored (no prefix) |
| 7.10 | Image with task | Send screenshot with `@fetch implement this design` | Creates task with image context |

---

## 8. API Endpoints

Test via curl from the host machine.

```bash
# Base URL
BASE=http://localhost:8765
```

| # | Test | Command | Expected |
|---|------|---------|----------|
| 8.1 | Health | `curl $BASE/api/health` | `{"status":"ok"}` |
| 8.2 | Status | `curl $BASE/api/status` | JSON: state, version, uptime, messageCount |
| 8.3 | Docs redirect | `curl -I $BASE/` | 302 → `/docs/` |
| 8.4 | Static docs | `curl $BASE/docs/index.html` | HTML content |
| 8.5 | 404 | `curl $BASE/api/nonexistent` | 404 response |
| 8.6 | Logout no auth | `curl -X POST $BASE/api/logout` | 401 Unauthorized |
| 8.7 | Logout with auth | `curl -X POST -H "Authorization: Bearer <token>" $BASE/api/logout` | 200 OK, WhatsApp disconnects |
| 8.8 | Dir traversal | `curl $BASE/docs/../../../etc/passwd` | 403 Forbidden |
| 8.9 | CORS header | `curl -I $BASE/api/status` | `Access-Control-Allow-Origin: *` |

> **Note:** The admin token is either `ADMIN_TOKEN` from `.env` or auto-generated (check container logs on startup).

---

## 9. TUI Manager

Launch with `fetch` in terminal.

| # | Test | How | Expected |
|---|------|-----|----------|
| 9.1 | Launch | Run `fetch` | Splash → main menu |
| 9.2 | Status screen | Select "Status" or press `s` | Shows container status, uptime |
| 9.3 | QR code | Select "QR Code" | Shows QR or "Already authenticated" |
| 9.4 | Recent logs | Select "Recent Logs" | Scrollable log viewer with messages |
| 9.5 | Scroll logs | Press `j`/`k` or `↑`/`↓` in log viewer | Scrolls through entries |
| 9.6 | Page logs | Press `PgUp`/`PgDn` | Pages through log entries |
| 9.7 | Top/bottom | Press `g` / `G` | Jumps to first/last log entry |
| 9.8 | Word wrap | Press `w` in log viewer | Toggles word wrap on/off |
| 9.9 | Raw mode | Press `r` in log viewer | Toggles raw JSON view |
| 9.10 | Copy log | Press `c` in log viewer | Copies current entry to clipboard |
| 9.11 | Restart containers | Select "Restart" | Docker containers restart |
| 9.12 | Update | Select "Update" | Pulls latest, rebuilds |
| 9.13 | Exit | Press `q` or `Esc` | Clean exit |

---

## 10. Docker & Infrastructure

| # | Test | How | Expected |
|---|------|-----|----------|
| 10.1 | Both containers up | `docker compose ps` | `fetch-bridge` (healthy) + `fetch-kennel` (running) |
| 10.2 | Bridge health | `docker inspect fetch-bridge --format='{{.State.Health.Status}}'` | `healthy` |
| 10.3 | Whisper available | `docker exec fetch-bridge ldd /usr/local/bin/whisper-cpp` | All libs found (no `not found`) |
| 10.4 | Kennel has CLIs | `docker exec fetch-kennel which claude` | `/usr/local/bin/claude` (or similar) |
| 10.5 | Volume persistence | `docker compose down && docker compose up -d` | Session data survives restart |
| 10.6 | Workspace mount | `docker exec fetch-kennel ls /workspace` | Lists workspace directories |
| 10.7 | Log persistence | Check `data/logs/` on host | Log files present |
| 10.8 | Chromium cleanup | After container restart, check for stale locks | No `SingletonLock` errors in bridge logs |
| 10.9 | Resource limits | `docker stats fetch-kennel` | Respects 2CPU / 2GB memory limit |
| 10.10 | Network isolation | `docker network inspect fetch_default` | Both containers on same network |

---

## 11. Modularity Verification

Test that each major module can be swapped, extended, or disabled without breaking the system.

### Harness Modularity

| # | Test | How | Expected |
|---|------|-----|----------|
| 11.1 | Remove a harness | Temporarily rename `fetch-app/src/harness/gemini.ts` | Gemini unavailable, Claude/Copilot still work |
| 11.2 | Add custom harness | Add a new adapter to `harness/` following the interface | Registers in registry, selectable via `use <name>:` |
| 11.3 | Harness fallback | Force an unavailable harness | Falls to next available, reports which |
| 11.4 | Registry list | Check `harness/registry.ts` exports | All registered harnesses returned by `getAvailable()` |

### Tool Modularity

| # | Test | How | Expected |
|---|------|-----|----------|
| 11.5 | Custom tool hot-reload | Add a JSON file to `data/tools/` | Chokidar detects it, tool becomes available |
| 11.6 | Custom tool removal | Delete the JSON file | Tool unloaded from registry |
| 11.7 | Custom tool edit | Modify the JSON file | Updated version loaded |
| 11.8 | Built-in tools intact | `@fetch /status` after custom tool changes | Core tools unaffected |

### Session Modularity

| # | Test | How | Expected |
|---|------|-----|----------|
| 11.9 | Thread isolation | Create thread A, add files, switch to thread B | Thread B has clean context |
| 11.10 | Thread restoration | Switch back to thread A | Files and history restored |
| 11.11 | Session persistence | Restart bridge container | Previous sessions survive (SQLite) |
| 11.12 | Session clear | `@fetch /clear` | Fresh state, but session record preserved |

### Identity Modularity

| # | Test | How | Expected |
|---|------|-----|----------|
| 11.13 | Edit collar | Modify `data/identity/COLLAR.md` | `/identity reset` reloads new personality |
| 11.14 | Add agent profile | Add a new `.md` to `data/agents/` | Appears in identity sections |
| 11.15 | Personality check | `@fetch /identity personality` | Shows current personality traits |

---

## 12. Error Handling & Recovery

| # | Test | How | Expected |
|---|------|-----|----------|
| 12.1 | Kennel down | `docker stop fetch-kennel` then send a task | Error: workspace unavailable, no crash |
| 12.2 | Kennel restart | `docker start fetch-kennel` then retry | Works normally |
| 12.3 | Invalid workspace | `@fetch /project nonexistent-name` | Error message, stays on current project |
| 12.4 | Delete active workspace | Try deleting the currently selected workspace | Blocked: "Cannot delete active workspace" |
| 12.5 | Bad tool params | Internally: call `create_workspace` with invalid name (`name with spaces!`) | Validation error from Zod schema |
| 12.6 | Bridge restart | `docker restart fetch-bridge` | Reconnects to WhatsApp, sessions preserved |
| 12.7 | Network hiccup | Briefly disconnect internet | WhatsApp reconnects automatically |
| 12.8 | Concurrent messages | Send 5 messages rapidly | All processed in order, no duplicates |
| 12.9 | Long response | Request something that generates a very long reply | Split into multiple WhatsApp messages |

---

## 13. Regression Checklist

Run these after any code change to catch regressions.

```
□ /version returns correct version
□ /help lists all commands
□ /projects lists workspaces
□ /status shows current state
□ Natural language greeting works
□ Task creation + completion works
□ Voice note transcription works
□ Image analysis works (if OPENROUTER_API_KEY set)
□ Thread create/switch/restore works
□ TUI launches and shows logs
□ API health endpoint responds
□ Untrusted number is silently dropped
□ /clear resets conversation
```

---

## 14. Environment-Specific Notes

### Missing API Keys

| Missing Key | Impact | How to Test |
|-------------|--------|-------------|
| `OPENROUTER_API_KEY` | Image analysis disabled | Send an image → should say "vision not available" |
| `ANTHROPIC_API_KEY` | Claude harness unavailable | `use claude:` → fallback to Gemini |
| `GOOGLE_API_KEY` | Gemini harness unavailable | `use gemini:` → fallback to Claude |
| `GITHUB_TOKEN` | Copilot harness unavailable | `use copilot:` → fallback |
| No whisper model | Voice notes disabled | Send voice note → "transcription not available" |

### First Run vs. Existing Session

| Scenario | Behavior |
|----------|----------|
| Fresh install (no `data/sessions.db`) | DB created on first message, empty session |
| Existing sessions | Loaded from SQLite on startup |
| QR not scanned | Status: `qr_pending`, TUI shows QR code |
| Already authenticated | Status: `authenticated`, ready immediately |

---

## Quick Test Script

Copy-paste these messages into WhatsApp in order for a rapid smoke test:

```
@fetch /version
@fetch hello
@fetch /projects
@fetch /project <your-project>
@fetch /status
@fetch what's changed?
@fetch /thread new test-thread
@fetch add a comment to index.ts explaining the main function
@fetch /task
@fetch /thread list
@fetch /clear
@fetch bye
```

If every message gets an appropriate response, the core system is working.
