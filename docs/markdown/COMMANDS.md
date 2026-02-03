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

## 🧠 Understanding Intents (V2)

Fetch automatically detects your intent and routes appropriately:

| Intent | Description | Handler | Example |
|--------|-------------|---------|--------|
| 💬 **Conversation** | Greetings, thanks, general chat | Direct response | `@fetch Hey!` |
| 📁 **Workspace** | Project management, git operations | 8 orchestrator tools | `@fetch list projects` |
| 🚀 **Task** | Complex coding work | Harness (Claude/Gemini/Copilot) | `@fetch Build a login page` |

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
| `@fetch /status` | Show git status of current project |
| `@fetch /diff` | Show uncommitted changes |
| `@fetch /log` | Show last 5 commits |
| `@fetch /log 10` | Show last 10 commits |

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

*Fetch Command Reference v0.2.0*
