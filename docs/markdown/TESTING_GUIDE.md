# v4.5.0 Testing Guide

> Manual verification checklist for the three v4.5.0 work streams via WhatsApp. Work through each section in order — later sections depend on earlier ones.

## Prerequisites

- [ ] Docker containers running (`docker compose up -d`)
- [ ] Bridge logs show "Fetch is Ready!" (`docker logs -f fetch-bridge`)
- [ ] WhatsApp connected (QR code scanned or session cached)
- [ ] At least one workspace exists with files in it

---

## Phase 1: Project Profiling

Test that Fetch detects framework, package manager, test runner, and entry points when selecting a workspace.

### 1.1 Workspace Selection (TypeScript/Node)

Send via WhatsApp:

```
@fetch list my workspaces
```

- [x] Response lists workspaces with project type labels (e.g. "typescript", "node") — not raw JSON
- [x] Active workspace is marked

> [!NOTE]
> Observed labels: `lab-test` correctly detected as "node". `github-test` and `my-app` are unlabeled (expected as they lack manifest files like `package.json`).

```
@fetch switch to <your-typescript-project>
```

- [x] Response says "Switched to ..." with project type and branch info
- [x] If the project has a framework (Next.js, Express, etc.), it should be mentioned

> [!NOTE]
> Observed labels: `lab-test` correctly detected as "node". `github-test` and `my-app` are unlabeled (expected as they lack manifest files like `package.json`).
> Switch to `lab-test` confirmed detection: "Node.js, JavaScript, branch main, clean".

### 1.2 Verify Profile in Context

```
@fetch what do you know about this project?
```

- [x] Response mentions the detected **language** (e.g. "TypeScript")
- [ ] Response mentions the **framework** if one exists (e.g. "Next.js", "Express")
- [x] Response mentions the **package manager** (e.g. "pnpm", "npm", "yarn")
- [ ] Response mentions the **test runner** if detected (e.g. "vitest", "jest")
- [x] Response mentions **entry points** (e.g. "src/index.ts")

> [!NOTE]
> `lab-test` profile verified:
>
> - Language: Node.js (JavaScript)
> - Entry point: index.js
> - Package manager: npm (via "npm run build")
> - No framework/test-runner detected (expected for this bare-bones workspace).

### 1.3 Profile Passed to Harness

```
@fetch use claude to add a hello world test
```

- [x] Check bridge logs (`docker logs fetch-bridge | grep "Project Context"`) — should show the `--- Project Context ---` block with language, framework, and commands
- [x] The harness should use the correct test command (e.g. `npx vitest run` not `npm test`) when writing or running tests

> [!NOTE]
> Verified via `lab-test`: Copilot correctly identified the Node.js context, installed `jest`, created a test directory, and ran the tests successfully (50s duration).

### 1.4 Multiple Project Types (Optional)

If you have workspaces of different types, repeat 1.1-1.2 for each:

- [ ] **Python** project — detects pip/poetry, pytest, main.py or app.py
- [ ] **Rust** project — detects cargo, `cargo test`, src/main.rs
- [ ] **Go** project — detects go modules, `go test ./...`, main.go

---

## Phase 2: Narrative Tool Outputs

Verify that all tool responses are human-readable text, not JSON dumps.

### 2.1 Workspace Tools

```
@fetch list workspaces
```

- [x] Output is a sentence like "3 workspaces: my-app (active, TypeScript, main), api (Go, dev)" — **not** a JSON block

```
@fetch what's the status of this workspace?
```

- [x] Output describes branch, modified files, ahead/behind in natural language — **not** JSON

### 2.2 Task Tools

```
@fetch what's the current task status?
```

- [ ] If a task exists: output is a sentence like "Task tsk_Xy7z running (45s) — 'goal'. Last: progress msg"
- [ ] If no task: a clear "no active task" message — **not** an error JSON blob

### 2.3 GitHub Tools

```
@fetch list pull requests
```

- [ ] Output lists PRs as "3 open PRs: #1 'title' (open, by user), ..." — **not** JSON array

```
@fetch show GitHub actions status
```

- [ ] Output lists workflow runs with pass/fail indicators — **not** raw JSON

### 2.4 Interaction Tools (Autonomy Check)

```
@fetch should you proceed with this?
```

- [ ] If autonomy is not "supervised", the LLM should auto-approve (response contains "Auto-approved: Yes, proceed") — not a JSON object

---

## Phase 3: Hybrid LLM Notifications

Verify that task notifications are varied and natural-sounding.

### 3.1 Task Started Notification

```
@fetch use claude to fix the README formatting
```

- [ ] WhatsApp notification for task start is a natural sentence (not just "Task started")
- [ ] The notification includes the goal text

### 3.2 Notification Variety

Run the same type of task 3 times (can cancel after the started notification):

```
@fetch use copilot to explain the main entry point
```

```
/stop
```

(repeat 3 times)

- [ ] At least 2 of the 3 "started" notifications have **different wording** (not identical templates)

### 3.3 Task Completion Notification

Let a task run to completion:

```
@fetch use claude to add a comment to the main entry point file
```

- [ ] Completion notification mentions the **summary** of what was done
- [ ] Completion notification includes **file counts** (e.g. "3 modified")
- [ ] Completion notification includes **duration** (e.g. "45s")
- [ ] Notification tone matches Fetch's personality (not robotic)

### 3.4 Task Failure Notification

Trigger a failure (e.g. work on a nonexistent workspace):

```
@fetch switch to nonexistent-workspace-xyz
@fetch use claude to build the project
```

- [ ] Failure notification includes the **error message**
- [ ] Failure notification is natural language, not a stack trace

### 3.5 Progress Messages

During a longer task, watch for progress updates:

- [ ] Progress messages are varied (not always "Working on it...")
- [ ] Progress messages mention specific actions when detectable (e.g. "installing dependencies", "running tests")

---

## Phase 4: Regression Smoke Test

Quick checks that existing features still work.

### 4.1 Safety Escape Commands

- [ ] `/status` — returns system status with version **v4.5.2**
- [ ] `/help` — returns command list (includes `/usage`)
- [ ] `/usage` — returns OpenRouter API usage (total, daily, weekly, monthly, limit)
- [ ] `/trust list` — shows trusted numbers (owner only)
- [ ] `/trust add <number>` — adds a trusted number (owner only)
- [ ] `/trust remove <number>` — removes a trusted number (owner only)
- [ ] `/clear` — clears conversation (confirms before clearing)

### 4.2 Conversational

```
@fetch hello, how are you?
```

- [ ] Responds conversationally (no tool calls, no errors)

### 4.3 Web Tools (if enabled)

```
@fetch search the web for "vitest testing framework"
```

- [ ] Returns search results with titles and snippets
- [ ] Results are formatted for WhatsApp (not JSON)

### 4.4 Workspace Create & Delete

```
@fetch create a workspace called test-checklist with the node template
```

- [ ] Response is narrative: "Created test-checklist ..."
- [ ] Workspace appears in workspace list

```
@fetch delete workspace test-checklist
```

- [ ] Asks for confirmation before deleting
- [ ] After confirming: response is "Deleted workspace test-checklist"

### 4.5 Git Sync (if GH_TOKEN configured)

```
@fetch sync this workspace
```

- [ ] Response mentions commit hash, files changed, push status — in natural language

---

## Results Summary

| Phase | Items | Passed | Failed | Notes |
|-------|-------|--------|--------|-------|
| 1. Project Profiling | 13 | | | |
| 2. Narrative Outputs | 8 | | | |
| 3. Notifications | 11 | | | |
| 4. Regression | 10 | | | |
| **Total** | **42** | | | |

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| JSON in tool responses | Old cached container | `docker compose down && docker compose up -d --build` |
| "Type: unknown" for project | Missing manifest file | Ensure `package.json` / `Cargo.toml` / etc. exists in workspace root |
| Same notification every time | LLM call failing silently | Check bridge logs for notification errors |
| Profile not showing framework | Framework file not at expected path | Check for `next.config.*`, `manage.py`, express in deps, etc. |
| `/status` shows old version | Stale container image | Rebuild: `docker compose build fetch-bridge` |
