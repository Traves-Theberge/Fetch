# Command Reference

## Trigger

All messages must start with `@fetch` to be processed:

```
@fetch /status
@fetch fix the login bug
@fetch hello
```

In direct (1:1) chats with Fetch, the `@fetch` prefix is optional.

## Instinct Commands

These are handled deterministically without an LLM call (<5ms):

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | `help`, `/commands` | Show available commands |
| `/status` | `status`, `/st` | System and task status |
| `/stop` | `stop`, `/cancel` | Cancel the running task |
| `/pause` | `pause` | Pause the running task |
| `/resume` | `resume`, `/continue` | Resume a paused task |
| `/clear` | `clear` | Clear conversation context |
| `yes` / `approve` | `y`, `ok`, `go` | Approve a pending action |
| `no` / `reject` | `n`, `deny` | Reject a pending action |
| `ping` | — | Health check |

## System Commands

| Command | Description |
|---------|-------------|
| `/help` | Full command list |
| `/status`, `/st` | System status + active task info |
| `/version`, `/v` | Show Fetch version (v3.5.0) |
| `/clear` | Clear conversation history |
| `/verbose` | Toggle verbose output |

## Project & Git Commands

| Command | Description |
|---------|-------------|
| `/projects`, `/list`, `/ls` | List workspace projects |
| `/project <name>` | Switch to a project |
| `/clone <url>` | Clone a git repository |
| `/init <name>` | Initialize a new project |
| `/status` | Git status of active project |
| `/diff` | Show uncommitted changes |
| `/log [n]` | Show last n commits (default 10) |
| `/undo` | Undo last commit (soft reset) |

## Settings Commands

| Command | Description |
|---------|-------------|
| `/verbose` | Toggle verbose mode on/off |
| `/autocommit` | Toggle auto-commit on/off |
| `/auto` | Toggle between autonomous and cautious mode |
| `/mode [level]` | Set autonomy: `supervised`, `cautious`, or `autonomous` |

> **Note:** `/mode verbose` is a common mistake — Fetch helpfully redirects you to use `/verbose` instead.
> Invalid mode names show all three options with descriptions.

## Identity & Skills Commands

| Command | Description |
|---------|-------------|
| `/identity` | Show current identity info |
| `/identity reset` | Reload identity from disk |
| `/identity <section>` | Show a specific identity section |
| `/skill` or `/skill list` | List all skills (enabled/disabled) |
| `/skill enable <name>` | Enable a skill |
| `/skill disable <name>` | Disable a skill |
| `/thread` | Show current thread info |
| `/thread list` | List all threads |
| `/thread switch <id>` | Switch to a thread |
| `/thread new` | Start a new thread |

## Proactive Commands

| Command | Description |
|---------|-------------|
| `/remind <time> <message>` | Set a one-shot reminder (e.g. `/remind 5m check tests`) |
| `/schedule <cron> <message>` | Schedule a recurring task (e.g. `/schedule 0 9 * * * daily standup`) |
| `/schedule list` | List all scheduled jobs |
| `/cron list` | List all cron jobs |
| `/cron remove <id>` | Remove a scheduled job |

## Task Control Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/stop` | `stop`, `/cancel`, `cancel` | Stop the running task |
| `/pause` | `pause` | Pause current task |
| `/resume` | `resume`, `/continue`, `continue` | Resume paused task |

## Context Commands

| Command | Description |
|---------|-------------|
| `/context <files>` | Add files to conversation context |
| `/context clear` | Clear all context files |

## Trust / Security Commands

| Command | Description |
|---------|-------------|
| `/trust add <number>` | Add a phone number to the whitelist |
| `/trust remove <number>` | Remove a number from the whitelist |
| `/trust list` | Show all trusted numbers |

## Natural Language

You don't need slash commands for everything. Fetch understands natural language:

| Message | What Happens |
|---------|--------------|
| "Hey Fetch!" | Chat response |
| "What projects do I have?" | Lists workspace projects via tools |
| "Build a REST API for users" | Creates a task, delegates to harness |
| "Fix the auth bug in login.ts" | Targeted coding task |
| "Explain how the rate limiter works" | Code explanation |

## Response Formats

When Fetch is working on a task, you'll see structured responses:

**Task started:**
```
🚀 Task started: Add input validation
🤖 Using Claude Code
📁 Project: my-api
```

**Progress update:**
```
📝 Editing src/routes/auth.ts...
📝 Creating src/middleware/validate.ts...
```

**Task complete:**
```
✅ Task complete!
Changed 3 files:
  • src/routes/auth.ts (modified)
  • src/middleware/validate.ts (created)
  • tests/auth.test.ts (created)
```

**Approval required (GUARDING mode):**
```
⚠️ This will delete 5 files. Approve?
Reply: yes/no
```
