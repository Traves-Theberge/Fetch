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

These are the 27 tools available to the LLM during the ReAct loop. They are defined with Zod schemas in `src/validation/tools.ts` and registered in `src/tools/registry.ts`.

> **Narrative Outputs:** All tool handlers return human-readable narrative text in their `output` field (consumed by the LLM) with full structured data in the `metadata` field (used for session state sync). This improves LLM reasoning compared to raw JSON dumps.

### Workspace Tools (7)

#### workspace_list

List all projects in the workspace directory.

**Parameters:** none (empty object)

**Returns:** Narrative text (e.g. `"3 workspaces: my-app (active, TypeScript, main), api (Go, dev)"`) with full structured data in `metadata`.

**Danger Level:** SAFE

#### workspace_select

Switch the active project. Triggers a system prompt rebuild so the LLM sees the new project context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Workspace name to select |

**Returns:** Narrative text (e.g. `"Switched to my-app (TypeScript, on main)"`) with full workspace data in `metadata`.

**Danger Level:** SAFE

#### workspace_status

Get detailed workspace status including git info.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | — | Workspace name (uses active workspace if not specified) |

**Returns:** Narrative text (e.g. `"my-app (TypeScript) - on feature-x - 3 modified, 1 untracked - 2 ahead"`) with full status in `metadata`.

**Danger Level:** SAFE

#### workspace_create

Create a new workspace/project. Automatically creates a GitHub repository and pushes initial commit if `GH_TOKEN` is configured.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Project name (alphanumeric, hyphens, underscores, max 64 chars) |
| `template` | string | — | Template: `empty`, `node`, `python`, `rust`, `go`, `react`, `next` (default: `empty`) |
| `description` | string | — | Brief description of the project (max 256 chars) |
| `initGit` | boolean | — | Initialize a git repository (default: `true`) |

**Returns:** Narrative text (e.g. `"Created my-app (TypeScript, npm, git initialized)"`) with full workspace data in `metadata`.

**Danger Level:** MODERATE

#### workspace_delete

Delete a workspace permanently. Requires explicit confirmation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Workspace to delete |
| `confirm` | boolean | ✅ | Must be `true` to confirm deletion |

**Returns:** Narrative text (e.g. `"Deleted workspace old-project"`)

> Cannot delete the currently active workspace. Select a different workspace first.

**Danger Level:** DANGEROUS

#### workspace_sync

Sync workspace to GitHub. Stages changes, commits, creates repo if needed, and pushes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | — | Workspace to sync (uses active workspace if not specified) |
| `message` | string | — | Commit message (auto-generated from changes if not provided, max 256 chars) |

**Returns:** Narrative text (e.g. `"Committed 4 files: 'Add auth' (abc1234), pushed to origin/main"`) with sync details in `metadata`.

**Danger Level:** MODERATE

#### workspace_publish

Create a new GitHub repository from an existing workspace and push all commits.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | — | Workspace to publish (uses active workspace if not specified) |
| `description` | string | — | Description for the new GitHub repository (max 256 chars) |
| `isPublic` | boolean | — | Make the repository public (default: `false` / private) |

**Returns:** Narrative text (e.g. `"Published my-app to github.com/user/my-app (private)"`) with repo URL in `metadata`.

> Fails if the workspace already has a remote. Use `workspace_sync` to push changes to an existing repo.

**Danger Level:** MODERATE

### Task Tools (4)

#### task_create

Create and start a new coding task. Delegates to a harness (Claude/Gemini/Copilot/OpenCode/Codex) running in the Kennel container via `docker exec`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `goal` | string | ✅ | Clear description of what to accomplish |
| `agent` | string | — | Agent to use: `copilot`, `gemini`, `claude`, `opencode`, `codex`, `auto` (default: `auto`). If multiple agents are enabled and user hasn't specified, the LLM must call `ask_user` first. |
| `workspace` | string | — | Target workspace (uses active workspace if not specified) |
| `timeout` | number | — | Task timeout in milliseconds (default: 300000 = 5 minutes) |

**Returns:** Narrative text (e.g. `"Created task tsk_Xy7z: 'Add error handling' → claude in my-project"`) with task data in `metadata`.

**Danger Level:** MODERATE

#### task_status

Check the status of a running task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `taskId` | string | — | Task ID (returns current task if not specified) |

**Returns:** Narrative text (e.g. `"Task tsk_Xy7z running (45s) — 'Add error handling'. Last: installing deps"`) with full task state in `metadata`.

**Danger Level:** SAFE

#### task_cancel

Cancel a running task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `taskId` | string | ✅ | ID of the task to cancel |

**Returns:** Narrative text (e.g. `"Cancelled task tsk_Xy7z (was running 32s)"`)

**Danger Level:** MODERATE

#### task_respond

Send user input to a task that is waiting for a response.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `response` | string | ✅ | Response to send to the waiting task |
| `taskId` | string | — | Task ID (uses current waiting task if not specified) |

**Returns:** Narrative text (e.g. `"Sent response to task tsk_Xy7z, resuming execution"`)

**Danger Level:** SAFE

### Interaction Tools (2)

#### ask_user

Send a question to the user via WhatsApp and wait for a reply.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `question` | string | ✅ | Question to ask the user |
| `options` | string[] | — | Optional list of choices for the user (max 10 options, each max 100 chars) |

**Returns:** `{ answer: string }`

> **Autonomy Guard:** In `cautious` or `autonomous` mode, questions matching unnecessary confirmation patterns ("Shall I...", "Would you like me to...", "Can I proceed...") are auto-approved without reaching the user. The LLM receives `"Yes, proceed."` as the answer. This is controlled by `ToolContext.autonomyLevel`.

**Danger Level:** SAFE

#### report_progress

Send a progress update to the user.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `message` | string | ✅ | Progress message to display |
| `percent` | number | — | Percentage complete (0-100) |

**Returns:** `{ sent: boolean }`

**Danger Level:** SAFE

### GitHub Tools (8)

#### github_pr_create

Create a pull request on GitHub from the current branch.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | ✅ | PR title (max 256 chars) |
| `body` | string | — | PR description (max 4000 chars) |
| `base` | string | — | Base branch to merge into (default: `main`) |
| `draft` | boolean | — | Create as a draft pull request (default: `true`) |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `{ url: string, number: number }`

**Danger Level:** MODERATE

#### github_pr_list

List pull requests for the current or specified repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `state` | string | — | Filter by PR state: `open`, `closed`, `all` (default: `open`) |
| `repo` | string | — | Target repository in `org/repo` format (e.g. `facebook/react`) |
| `limit` | number | — | Maximum number of results (1-100, default: 10) |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `object[]` (array of PR objects)

**Danger Level:** SAFE

#### github_pr_view

View details of a specific pull request including reviews and comments.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `number` | number | ✅ | Pull request number |
| `repo` | string | — | Target repository in `org/repo` format |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `object` (PR details)

**Danger Level:** SAFE

#### github_issue_create

Create a new GitHub issue in the current repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | ✅ | Issue title (max 256 chars) |
| `body` | string | — | Issue description (max 4000 chars) |
| `labels` | string[] | — | Labels to apply (max 10 labels, each max 50 chars) |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `{ url: string, number: number }`

**Danger Level:** MODERATE

#### github_issue_list

List issues for the current repository with optional filters.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `state` | string | — | Filter by issue state: `open`, `closed`, `all` (default: `open`) |
| `assignee` | string | — | Filter by assignee username (max 39 chars) |
| `labels` | string[] | — | Filter by labels (max 10 labels) |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `object[]` (array of issue objects)

**Danger Level:** SAFE

#### github_branch_create

Create a new git branch and push it to GitHub.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✅ | Branch name (max 100 chars, alphanumeric/hyphens/dots/slashes) |
| `from` | string | — | Branch to create from (defaults to current branch) |
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `object` (branch details)

**Danger Level:** MODERATE

#### github_action_status

Get the status of recent GitHub Actions workflow runs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace` | string | — | Workspace (uses active workspace if not specified) |

**Returns:** `object[]` (array of workflow run objects)

**Danger Level:** SAFE

#### github_search_repos

Search GitHub repositories by keyword.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✅ | Search query (max 256 chars) |
| `limit` | number | — | Maximum number of results (1-20, default: 5) |

**Returns:** `object[]` (array of repository objects)

**Danger Level:** SAFE

### Web Tools (2)

#### web_fetch

Fetch a web page and extract its readable content as markdown. Uses jsdom + Mozilla Readability + Turndown. Blocks private/internal URLs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | ✅ | URL to fetch (must be a valid http/https URL) |
| `selector` | string | — | Optional CSS selector to extract specific content from the page (max 200 chars) |

**Returns:** `{ url, title, content, truncated, length }` (HTML pages) or `{ url, contentType, content }` (JSON/plain text)

> **Security:** Private/internal URLs (localhost, 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 0.0.0.0, ::1, fe80:) are blocked. Content is truncated at 50,000 characters. Requests time out after 30 seconds.

**Danger Level:** SAFE

#### web_search

Search the web using a self-hosted SearXNG meta search engine. Returns structured results with title, URL, snippet, and engine source.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✅ | Search query (1-400 chars) |
| `count` | number | — | Number of results to return (1-20, default: 5) |
| `category` | string | — | Search category: `general`, `images`, `news`, `science`, `it` (default: `general`) |

**Returns:** `{ query, count, results: [{ title, url, snippet, engine }] }`

> **Requires:** SearXNG container running (`docker compose up -d`). Searches time out after 15 seconds.

**Danger Level:** SAFE

### Browser Tools (4)

#### browser_open

Open a URL in a headless browser and return an accessibility tree snapshot with numbered element refs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | ✅ | URL to navigate to (must be a valid URL) |
| `waitUntil` | string | — | Wait condition: `load`, `domcontentloaded`, or `networkidle` (default: `load`) |

**Returns:** Accessibility tree snapshot text (from browser-agent.mjs stdout)

**Danger Level:** MODERATE

#### browser_snapshot

Get the current page's accessibility tree snapshot without navigating.

**Parameters:** none (empty object)

**Returns:** Accessibility tree snapshot text

**Danger Level:** SAFE

#### browser_action

Perform an action on the browser page using element ref numbers from the snapshot.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | ✅ | Action type: `click`, `type`, `scroll_down`, `scroll_up`, `back`, `forward` |
| `ref` | number | — | Element ref number from browser_snapshot (required for `click` and `type`) |
| `text` | string | — | Text to type into the element (required for `type` action, max 2000 chars) |
| `x` | number | — | X coordinate for coordinate-based click |
| `y` | number | — | Y coordinate for coordinate-based click |

**Returns:** Updated accessibility tree snapshot text

> Scroll actions use `scroll_down` / `scroll_up` (not a separate `direction` parameter).

**Danger Level:** MODERATE

#### browser_screenshot

Capture a screenshot of the current browser page.

**Parameters:** none (empty object)

**Returns:** Base64-encoded PNG screenshot (from browser-agent.mjs stdout)

**Danger Level:** SAFE

> **Note:** Browser tools require `ENABLE_BROWSER=true` and Playwright+Chromium installed in the Kennel container. Browser state persists across tool calls within a session. All browser commands execute inside `fetch-kennel` via `docker exec` with a 30-second timeout.

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
