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

## Built-in Commands

### System Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `@fetch help` | `@fetch ?` | Show available commands |
| `@fetch status` | `@fetch s` | System and task status |
| `@fetch ping` | — | Quick connectivity test |

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

## Natural Language Tasks

Just describe what you need:

### Code Tasks

```
@fetch Fix the bug in auth.ts where tokens expire too early
```

```
@fetch Add error handling to the UserService class
```

```
@fetch Refactor the login function to use async/await
```

### Explanation Tasks

```
@fetch Explain how the useEffect hook works in React
```

```
@fetch What does this regex do: /^[a-z]+$/
```

### Git Tasks

```
@fetch What's the git status?
```

```
@fetch Create a commit with message "fix: auth token expiry"
```

```
@fetch Show me the diff for the last commit
```

### Testing Tasks

```
@fetch Run the tests for the auth module
```

```
@fetch Write unit tests for the UserService class
```

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
- const expired = new Date(exp) < new Date();
+ const expired = exp < Date.now() / 1000;
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

### Use Undo Freely

If something goes wrong:
```
@fetch undo
```

To revert everything from this session:
```
@fetch undo all
```

### Check Status

Before starting a new task:
```
@fetch status
```

---

*Fetch Command Reference v0.1.0*
