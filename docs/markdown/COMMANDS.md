# 📱 Fetch Command Reference

A quick reference for all WhatsApp commands and interactions with Fetch.

---

## The @fetch Trigger

**All messages must start with `@fetch`** (case-insensitive):

```
@fetch your message here
@Fetch also works
@FETCH ALSO WORKS
```

Messages without `@fetch` are silently ignored for security.

---

## 🧠 Understanding Modes (V3)

Fetch operates as a state machine with 5 distinct modes. The background color of the TUI and the emoji in the response indicate the current mode.

| Mode | Emoji | Description |
|------|-------|-------------|
| **ALERT** | 🟢 | Ready and listening. Default state. |
| **WORKING** | 🔵 | Actively executing a task. Ignores most chatter, listens for `stop`. |
| **WAITING** | 🟠 | Paused, waiting for your input (e.g., "Which file?"). |
| **GUARDING** | 🔴 | Locked. Detected a dangerous action, needs explicit generic approval. |
| **RESTING** | 💤 | Idle/Sleeping. (Reserved for future autonomy). |

---

## ⚡ Reflex Commands (Fast-Path)

Reflexes are deterministic commands that bypass the AI agent. They work in ANY mode.

| Command | Action |
|---------|--------|
| `stop`, `cancel` | **immediately** cancels the current task and returns to ALERT. |
| `status` | Reports current mode, active task, and last action. |
| `clear` | Clears conversation context (short-term memory). |
| `help` | Shows brief help menu. |

---

## 🛠️ Management Commands (V3.1)

### 🎭 Identity Management
Control Fetch's personality and system prompts.

- `/identity reset` - Force reload of all identity files (`COLLAR.md`, `ALPHA.md`).
- `/identity collar` - Show the core rules.
- `/identity alpha` - Show the user profile.

### 🧩 Skill Management
Manage the "Pack's" capabilities on the fly.

- `/skill list` - Show all loaded skills.
- `/skill enable <name>` - Enable a specific skill.
- `/skill disable <name>` - Disable a specific skill.
- `/skill vars <name>` - Show required environment variables for a skill.

### 🧵 Thread Management
Switch between different conversation contexts or projects.

- `/thread list` - Show active conversation threads.
- `/thread switch <id>` - Switch context to a different thread.
- `/thread archive` - Save and close the current thread.

---

## Orchestrator Tools (11)

Fetch has **11 built-in tools** organized into three categories:

### Workspace Tools (5)

| Tool | Description | Parameters |
|------|-------------|------------|
| `workspace_list` | List all projects | — |
| `workspace_select` | Select active project | `name` |
| `workspace_status` | Git status & branch | — |
| `workspace_create` | Create new project | `name`, `template?`, `description?`, `initGit?` |
| `workspace_delete` | Delete a project | `name`, `confirm: true` |

### Task Tools (4)

| Tool | Description | Parameters |
|------|-------------|------------|
| `task_create` | Start a coding task | `goal`, `agent?`, `files?` |
| `task_status` | Get task progress | `taskId?` |
| `task_cancel` | Cancel running task | `taskId?` |
| `task_respond` | Answer agent question | `response` |

### Interaction Tools (2)

| Tool | Description | Parameters |
|------|-------------|------------|
| `ask_user` | Ask clarifying question | `question`, `options?` |
| `report_progress` | Report task progress | `message`, `percent?`, `files?` |

### Available Templates (workspace_create)

| Template | Creates |
|----------|---------|
| `empty` | Just README.md |
| `node` | package.json, index.js, .gitignore |
| `python` | main.py, requirements.txt |
| `rust` | Cargo.toml, src/main.rs |
| `go` | go.mod, main.go |
| `react` | Vite React scaffold |
| `next` | Next.js scaffold |

---

## Built-in Commands

### System Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch help` | `@fetch ?` | Show available commands |
| `@fetch ping` | — | Quick connectivity test |
| `@fetch task` | — | Show current task status |

### Project Management

| Command | Description |
|---------|-------------|
| `@fetch /projects` | List all projects in workspace |
| `@fetch /project <name>` | Switch to a specific project |
| `@fetch /clone <url>` | Clone a git repository |
| `@fetch /init <name>` | Initialize a new project |

### Git Commands

| Command | Description |
|---------|-------------|
| `@fetch /status` | Show git status of current project (includes Repo Map status) |
| `@fetch /diff` | Show uncommitted changes |
| `@fetch /log` | Show last 5 commits |
| `@fetch /log 10` | Show last 10 commits |

### Security (Zero Trust Bonding)

Manage who can use `@fetch` in group chats. **Owner only.**

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch /trust add <number>` | — | Add phone number to whitelist |
| `@fetch /trust remove <number>` | `/trust rm`, `/trust delete` | Remove from whitelist |
| `@fetch /trust list` | `/trust ls` | Show all trusted numbers |
| `@fetch /trust clear` | — | Remove ALL trusted numbers |
| `@fetch /trust` | — | Show trust command help |

**Note:** Owner is always trusted and cannot be locked out.

### Task Control

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch stop` | `@fetch cancel` | Cancel current task |
| `@fetch pause` | — | Pause current task |
| `@fetch resume` | `@fetch continue` | Resume paused task |
| `@fetch undo` | — | Revert last file changes |
| `@fetch undo all` | — | Revert all session changes |

### Context Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch add <file>` | `@fetch +` | Add file to active context |
| `@fetch drop <file>` | `@fetch -` | Remove file from context |
| `@fetch files` | `@fetch context` | List active files |
| `@fetch clear` | `@fetch reset` | Clear conversation history |

### Autonomy Control

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch auto` | `@fetch autonomous` | Enable autonomous mode |
| `@fetch supervised` | — | Return to supervised mode |
| `@fetch mode` | — | Show current mode |
| `@fetch mode <level>` | — | Set autonomy level |

**Autonomy Levels:**

| Level | Behavior |
|-------|----------|
| `supervised` | Asks before EVERY action |
| `semi-autonomous` | Auto-approves reads, asks for writes |
| `autonomous` | Full autonomy (still asks for destructive ops) |

### Preferences

| Command | Description |
|---------|-------------|
| `@fetch verbose` | Toggle detailed progress updates |
| `@fetch autocommit` | Toggle auto-commit after changes |

---

## Approval Responses

When Fetch asks for approval, respond with:

| Response | Aliases | Effect |
|----------|---------|--------|
| `yes` | `y`, `ok`, `approve`, `👍` | Approve and execute |
| `no` | `n`, `nope`, `reject`, `👎` | Reject action |
| `skip` | `s` | Skip this step, continue |
| `yes all` | `yesall`, `approve all` | Approve all future actions |

---

## Mode Examples

### 💬 Conversation Mode

Simple greetings and thanks—no tools needed:

```
@fetch Hey there!
```
→ *"Hey! 👋 How can I help you today?"*

```
@fetch Thanks for the help!
```
→ *"You're welcome! Let me know if you need anything else."*

### � Workspace Intent

Project management and git operations:

```
@fetch list projects
```
→ Lists all projects in workspace

```
@fetch show status
```
→ Shows git status of current project

```
@fetch switch to my-app
```
→ Changes active workspace

### 🚀 Task Intent

Complex coding work—delegated to AI harness:

```
@fetch Build a user authentication system with JWT
```
→ Delegates to Claude/Gemini/Copilot CLI for multi-step execution

```
@fetch Refactor the entire auth module to use async/await
```
→ AI CLI handles planning and implementation

---

## Response Formats

### Task Started

```
🔄 *Working on: Fix auth bug*

I'll analyze the code and fix the token expiry issue.
```

### Progress Update

```
🔄 *Working on: Fix auth bug*

✅ 1. Read auth.ts
✅ 2. Found expiry check
⏳ 3. Preparing fix...
⬚ 4. Run tests
```

### Approval Request

```
📝 *Edit: src/auth.ts*
─────────────────────
Line 45:
🔴 - const expired = new Date(exp) < new Date();
🟢 + const expired = exp < Date.now() / 1000;
─────────────────────
Apply? (yes/no)
```

### Task Complete

```
✅ *Task Complete*

Fixed the token expiry bug.

📁 *Modified:* auth.ts
📝 *Commit:* a1b2c3d fix: token expiry
🧪 *Tests:* 12/12 passing

Say "undo" to revert.
```

### Task Blocked

```
⚠️ *Need Help*

I can't find the file you mentioned.

Options:
1. Tell me the correct path
2. List available files
3. Cancel task

Reply with 1, 2, or 3
```

---

## Tips

### Be Specific

```
❌ @fetch fix the bug
✅ @fetch fix the authentication bug in src/auth.ts
```

### Provide Context

```
❌ @fetch explain this code
✅ @fetch explain the useEffect in components/Dashboard.tsx
```

### Use Project Commands

```
@fetch /projects              # See available projects
@fetch /project my-api        # Switch to my-api
@fetch /status                # Check git status
```

### Use Undo Freely

If something goes wrong:
```
@fetch undo
```

To revert everything from this session:
```
@fetch undo all
```

---

*Fetch Command Reference v2.1.0*
