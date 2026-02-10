# 🧪 Fetch v4.0.6 Testing Guide

> **Philosophy:** The Conversation IS the Interface.
> **Version:** 4.0.6 (GitHub Tools Expansion)

This guide covers how to validate the Fetch system, from automated unit tests to conversational end-to-end flows. Since v4.0 removed explicit "modes" and "intents", testing focuses on **Agent Decision Quality**—verifying the LLM chooses the right tools for the job. Fetch now features **21 tools** following the GitHub expansion.

---

## 🏗️ 1. Automated Validation (CI/CD)

Before manual testing, ensure the codebase is healthy.

### Bridge (Node.js)

The bridge handles WhatsApp, the agent core, and tool orchestration.

```bash
cd fetch-app

# 1. Type Check (Strict)
npm run type-check   # Runs tsc --noEmit

# 2. Unit & Integration Tests
npm test             # Runs vitest run
```

**Success Criteria:**

- `tsc` exits with code 0 (0 errors).
- Vitest reports **173 passed** (or more).

---

## 🐕 2. Manual Bond & Boot (Infrastructure)

Verify the system is running and bonded to WhatsApp.

### Startup

```bash
# In the project root
docker compose up -d
docker logs -f fetch-bridge
```

**Verification:**

1. Log shows `[Bridge] Initializing...`
2. Log shows `[WhatsApp] Authenticated as <Your Number>` (or QR code if new).
3. Log shows `[Agent] System Prompt loaded (${length} chars)`.
4. Log shows `[Server] Health check listening on 3000`.

### Safety Gate (Hardcoded Commands)

Send these messages from your WhatsApp phone to the bot. These bypass the LLM entirely.

| Message | Expected Response | Purpose |
|---------|-------------------|---------|
| `/ping` | `🏓 Pong! ...` | Verify command parser & WhatsApp connection. |
| `/whoami`| `🆔 User: <Number> | Role: owner` | Verify whitelist authority. |
| `/clear` | `🧹 Context cleared.` | Reset conversation context. |
| `/help` | (Help text about tools) | Verify help text generation. |

---

## 🧠 3. Conversational Capabilities (The Agent)

In v4.0, every message below is sent to the LLM. We test if the LLM **chooses** the correct behavior.

### A. Pure Chat (No Tools)

- **User:** "Hello! Who are you?"

- **Expected:** A natural language response describing itself as Fetch, based on the `identity/ALPHA.md` persona.
- **Logs:** `[Core] LLM decided: distinct(conversation)` (or tool list empty).

### B. Workspace Exploration (Read-Only Tools)

- **User:** "List the files in the current workspace."

- **Internal:** Agent should call `workspace_list`.
- **Expected:** "I see the following files: ..." (Lists files).
- **User:** "Read the README.md file."
- **Internal:** Agent should call `read_file`.
- **Expected:** Summary or contents of the README.

### C. Task Execution (Active Tools)

- **User:** "Create a file called `hello.txt` with the text 'Hello World'."

- **Internal:** Agent should call `run_terminal` with `echo "Hello World" > hello.txt` or similar.
- **Expected:** "I've created the file."
- **Verification:**

    ```bash
    docker exec fetch-kennel cat /workspace/hello.txt
    ```

### D. Multi-Step Reasoning

- **User:** "Create a new directory called `test-project`, go into it, and initialize a git repo."

- **Internal:**
    1. `run_terminal` (`mkdir test-project`)
    2. `run_terminal` (`cd test-project && git init`)
    *Note: The agent might do this in one or multiple turns.*
- **Expected:** Confirmation of all steps.

---

## ☁️ 4. Feature-Specific Tests

### A. Workspace Sync (GitHub)

- **User:** "Sync this workspace to GitHub."

- **Pre-req:** `GH_TOKEN` must be set in `.env` and valid.
- **Internal:** Agent calls `workspace_sync`.
- **Expected:** "I've pushed the changes. You can view them at <https://github.com/.../>..."

### B. Memory & Context

- **User:** "My name is Traves."

- **Bot:** "Nice to meet you, Traves."
- **User:** "/clear" (Resets short-term context)
- **User:** "What is my name?"
- **Expected:** If Long-Term Memory is active/relevant, it might recall. If only short-term, it might say "I don't know." (Useful for testing context window limits).

### C. Container Isolation

- **User:** "Delete the root directory /"

- **Internal:** Agent calls `run_terminal` (`rm -rf /`).
- **Expected:** Should fail (permission denied) or only affect the `fetch-kennel` container, NOT the host or the `fetch-bridge`.
- **Verification:** Host system remains intact.

### D. GitHub Power User (Active Tools)

- **User:** "Create an issue on this repo saying 'Verification successful'."

- **Internal:** Agent calls `github_issue_create`.
- **Expected:** Confirmation with issue number/link.
- **User:** "List all open PRs."
- **Internal:** Agent calls `github_pr_list`.
- **Expected:** Table or list of open Pull Requests.

---

## 📋 Test Log (Sample)

| Test Case | Status | Notes |
|-----------|--------|-------|
| `npm test` | ✅ Pass | 173+ tests. |
| `/ping` | ✅ Pass | Latency < 1s. |
| Workspace List | ✅ Pass | Correctly listed files. |
| File Write | ✅ Pass | `hello.txt` verification success. |
| GitHub Sync | ✅ Pass | Verified with `v4.0.6` tools. |
| GitHub PR List | ✅ Pass | Returns repository PRs. |
