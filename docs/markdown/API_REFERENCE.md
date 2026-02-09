# API Reference

## Status API

The Bridge exposes an HTTP API on port 8765.

### GET /api/status

Returns system health and WhatsApp connection state.

**Response:**

```json
{
  "state": "authenticated",
  "qrCode": null,
  "qrUrl": null,
  "uptime": 3600,
  "messageCount": 42,
  "lastError": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `state` | string | `initializing`, `qr_pending`, `authenticated`, `disconnected`, `error` |
| `qrCode` | string\|null | Raw QR code data when `state` is `qr_pending` |
| `qrUrl` | string\|null | URL to render QR code image when `state` is `qr_pending` |
| `uptime` | number | Seconds since start |
| `messageCount` | number | Messages processed this session |
| `lastError` | string\|null | Most recent error message |

### GET /api/health

Lightweight health check (used by the Go TUI manager).

**Response:** `{ "healthy": true }`

### POST /api/logout

Disconnects the WhatsApp session. Requires authentication.

**Headers:**

```
Authorization: Bearer <ADMIN_TOKEN>
```

**Response:** `{ "success": true }`

The `ADMIN_TOKEN` is auto-generated on startup and logged to console, or set via the `ADMIN_TOKEN` environment variable.

---

## Orchestrator Tools

These are the 13 tools available to the LLM during the ReAct loop. They are defined with Zod schemas in `src/validation/tools.ts` and registered in `src/tools/registry.ts`.

### Workspace Tools

#### workspace_list

List all projects in the workspace directory.

**Parameters:** none

**Returns:** `{ projects: string[] }`

#### workspace_select

Switch the active project. Triggers a system prompt rebuild so the LLM sees the new project context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Project directory name |

**Returns:** `{ selected: string, path: string }`

#### workspace_status

Get the active project's git status and file overview.

**Parameters:** none

**Returns:** `{ project: string, branch: string, status: string, recentFiles: string[] }`

#### workspace_create

Initialize a new project in the workspace. Automatically creates a GitHub repository and pushes initial commit if `GH_TOKEN` is configured.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Project name (alphanumeric, hyphens, underscores) |
| `template` | string | — | Template to use |

**Returns:** `{ created: string, path: string }`

#### workspace_delete

Remove a project from the workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Project to delete |

**Returns:** `{ deleted: string }`

#### workspace_sync

Commit local changes and push to the GitHub remote. Generates a commit message from the diff if not provided.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `message` | string | — | Commit message (auto-generated if omitted) |

**Returns:** `{ synced: boolean, commit: string, remote: string }`

#### workspace_publish

Create a new GitHub repository from an existing project. Useful when a project was created without a remote or the auto-creation failed.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Repository name |
| `private` | boolean | — | Whether repo should be private (default: true) |

**Returns:** `{ published: boolean, url: string }`

### Task Tools

#### task_create

Create and start a new coding task. Delegates to a harness (Claude/Gemini/Copilot) running in the Kennel container via `docker exec`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `goal` | string | ✅ | What to accomplish |
| `harness` | string | — | Preferred harness (`claude`, `gemini`, `copilot`) |

**Returns:** `{ taskId: string, status: string, harness: string }`

#### task_status

Check the status of a running task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `taskId` | string | — | Specific task (defaults to active) |

**Returns:** `{ taskId: string, status: string, output: string }`

#### task_cancel

Cancel a running task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `taskId` | string | — | Specific task (defaults to active) |

**Returns:** `{ cancelled: string }`

#### task_respond

Send user input to a task that is waiting for a response.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `response` | string | ✅ | User's response text |
| `taskId` | string | — | Specific task |

**Returns:** `{ delivered: boolean }`

### Interaction Tools

#### ask_user

Send a question to the user via WhatsApp and wait for a reply.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `question` | string | ✅ | Question to ask |

**Returns:** `{ answer: string }`

> **Autonomy Guard:** In `cautious` or `autonomous` mode, questions matching unnecessary confirmation patterns ("Shall I...", "Would you like me to...", "Can I proceed...") are auto-approved without reaching the user. The LLM receives `"Yes, proceed."` as the answer. This is controlled by `ToolContext.autonomyLevel`.

#### report_progress

Send a progress update to the user.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `message` | string | ✅ | Progress message |

**Returns:** `{ sent: boolean }`

---

## Security Interfaces

### SecurityGate

Controls message authorization.

| Method | Description |
|--------|-------------|
| `authorize(message)` | Returns `{ allowed: boolean, reason?: string }` |
| `isOwnerMessage(message)` | Checks if sender is `OWNER_PHONE_NUMBER` |
| `stripTrigger(text)` | Removes `@fetch` prefix |

### RateLimiter

Sliding window rate limiter.

| Method | Description |
|--------|-------------|
| `isAllowed(key)` | Returns `boolean` — checks if under rate limit |
| `remaining(key)` | Returns `number` — remaining requests in window |
| `clear(key)` | Reset a specific key's history |
| `clearAll()` | Reset all rate limit state |

**Default config:** 30 requests per 60-second sliding window.

### InputValidator

Validates and sanitizes user input.

| Method | Description |
|--------|-------------|
| `validate(input)` | Returns `{ valid: boolean, sanitized: string, reason?: string }` |

Blocks: command substitution (`$()`), `rm -rf` patterns, pipe-to-shell, `eval()`, prototype pollution, null bytes, control characters. Allows backticks (for code discussion).

---

## Tool Context

```typescript
interface ToolContext {
  sessionId?: string;       // Session ID for session-aware tools
  autonomyLevel?: string;   // Current autonomy level for ask_user guard
}
```

The `autonomyLevel` field flows from the session's preferences through the tool registry to individual tool handlers. The `ask_user` tool uses it to decide whether to auto-approve confirmation questions.

---

## Session Types

```typescript
interface Session {
  id: string;                    // ses_<timestamp>
  userId: string;                // Phone number
  metadata: SessionMetadata;     // Created/updated timestamps
  messages: Message[];           // Conversation history
  project: ProjectContext | null;// Active project
  activeFiles: string[];         // Files in context
  repoMap: string | null;        // Cached repo map
  preferences: UserPreferences;  // Autonomy, verbose, autocommit
  activeTaskId: string | null;   // Currently running task
  gitStartCommit: string | null; // Commit SHA for undo boundary
}
```

## Task Types

```typescript
interface Task {
  id: string;
  sessionId: string;
  goal: string;
  status: TaskStatus;  // pending → running → completed | failed | cancelled
  harness: string;
  createdAt: string;
  updatedAt: string;
  result?: TaskResult;
  iterations: number;
  maxIterations: number;
}
```

Task status transitions: `pending` → `running` → `waiting_input` → `running` → `completed` | `failed` | `cancelled`
