**Fetch**.

# Project Name: Fetch (Your Faithful Code Companion)

## 1. Executive Summary

**Fetch** is a headless, "ChatOps" development environment. It acts as a bridge between a user on WhatsApp and a suite of powerful AI coding agents (Claude Code, Gemini CLI, GitHub Copilot).

The goal is to allow a user to "program on the go" by sending natural language tasks via WhatsApp. Fetch processes these requests, orchestrates the appropriate AI agent to execute the work in a secure Docker container, and reports the results back to the user.

**Core Philosophy:**

* **Loyal:** Responds *only* to the owner's phone number.
* **Obedient:** Executes commands precisely within a sandboxed environment.
* **Retriever:** Fetches code, logs, and answers using Model Context Protocol (MCP) tools.

---

## 2. System Architecture

The system uses a **"Dual-Core" Architecture** to separate system management from application logic.

### A. The Manager (The "Collar")

* **Language:** Go (Golang)
* **Libraries:** `bubbletea` (TUI), `lipgloss` (Styling).
* **Function:** A lightweight Terminal User Interface (TUI) for managing Fetch. It handles:
* Installation & Updates (Git pull + Rebuild).
* Configuration (Editing `.env` safely).
* Service Control (Systemd Start/Stop).
* Live Log Viewing.



### B. The Application (The "Brain" & "Muscle")

The application runs as a **Multi-Container Docker Pod**:

1. **Container 1: The Bridge (The Brain)**
* **Stack:** Node.js, TypeScript, `whatsapp-web.js`.
* **Role:** Connects to WhatsApp, authenticates the user, and acts as the **Orchestrator**. It maintains the Task Database and decides which agent to deploy.
* **Access:** Has access to the Docker socket to command the Kennel.


2. **Container 2: The Kennel (The Muscle)**
* **Stack:** Ubuntu 22.04.
* **Role:** The execution sandbox. It contains the pre-installed CLIs (Claude Code, Gemini CLI, GitHub Copilot).
* **Mounts:**
* `/workspace`: A shared volume where code is written.
* `/root/.config`: Read-only mounts for auth tokens (headless auth).





---

## 3. Functional Requirements

### 3.1 Security & Access Control

* **Whitelist Enforcement:** The Bridge must strictly validate every incoming WhatsApp message against `OWNER_PHONE_NUMBER` in the `.env` file. Messages from unauthorized numbers must be silently dropped.
* **Input Sanitization:** User input must *never* be concatenated directly into shell strings. Use array-based argument passing (e.g., `spawn('cmd', ['arg1', 'arg2'])`) to prevent Terminal Injection attacks.
* **Output Sanitization:** All text returned to WhatsApp must pass through an ANSI stripper to remove terminal color codes and progress bars that would render poorly in chat.

### 3.2 The Orchestrator (Loop)

* **The Brain:** Uses OpenRouter (GPT-4.2-Nano) to parse user intent.
* **Task Management:**
* Must create a structured Task Object (ID, Status, Assigned Agent, Logs) for every request.
* Must persist tasks to a local JSON/SQLite database so context isn't lost on reboot.


* **Agent Dispatch:**
* If the user asks for a complex refactor → Dispatch **Claude Code**.
* If the user asks for a quick explanation → Dispatch **Gemini CLI**.
* If the user asks about a git error → Dispatch **GitHub Copilot CLI**.



### 3.3 The Supervisor (Agent Wrapper)

* Since CLIs are "fire-and-forget," the Bridge must run a "Supervisor" script that:
1. Sets the Task status to `IN_PROGRESS`.
2. Executes the CLI tool inside the **Kennel** container using `docker exec`.
3. Captures `stdout` and `stderr`.
4. Updates the Task history with the logs.
5. Reports the final status back to the Orchestrator.



### 3.4 Headless Configuration (Edge Case Handling)

* **No Interactive Logins:** The system cannot pop up a browser on the Pi.
* **Copilot:** Must rely on mounting a pre-authenticated `hosts.json` from the host machine into the container.
* **Claude/Gemini:** Must rely strictly on API Key environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) passed into the container.


* **MCP Configuration:** The Kennel must include a `config.json` for Claude Code that enables the `filesystem` and `git` MCP servers, pointing them to the `/workspace` directory.

---

## 4. Implementation Checklist (The "Builder's List")

Use this checklist to generate the codebase step-by-step.

### Phase 1: Infrastructure (The Foundation)

* [ ] **Project Setup:** Initialize the monorepo structure (`/manager` for Go, `/fetch-app` for Node).
* [ ] **Docker Setup:** Create the `docker-compose.yml` defining the `bridge` and `kennel` services.
* [ ] **Kennel Dockerfile:** Write the Ubuntu-based Dockerfile that installs `gh`, `gh-copilot`, `claude-code`, and `gemini-chat-cli`.
* [ ] **Volume Strategy:** Create the folder structure for `./config/github` and `./config/claude` to allow "drop-in" authentication keys.

### Phase 2: The Manager (Go TUI)

* [ ] **Main Menu:** Create a Bubble Tea model with options: Start, Stop, Config, Logs, Update.
* [ ] **Config Editor:** Implement a form (using `huh?`) that reads/writes the `.env` file (API Keys, Whitelist).
* [ ] **Service Control:** Implement Go functions to interact with `systemd` (check status, restart service).

### Phase 3: The Bridge (Node.js Logic)

* [ ] **WhatsApp Client:** Initialize `whatsapp-web.js` with QR code generation (outputting to terminal logs).
* [ ] **Security Layer:** Implement the middleware that filters messages by `remoteJid` (Phone Number).
* [ ] **Orchestrator Logic:** Write the OpenRouter integration that takes a user prompt and outputs a JSON Action Plan (e.g., `{"tool": "claude", "args": ["fix bug"]}`).
* [ ] **Docker Executor:** Write the Node.js function that uses `spawn` to run commands inside the `fetch-kennel` container safely.

### Phase 4: Integration & Polish

* [ ] **Task DB:** Implement a simple JSON file adapter to save/load tasks.
* [ ] **ANSI Stripper:** Add a regex utility to clean CLI output before sending to WhatsApp.
* [ ] **Testing:** Verify that a "Hello World" task flows from WhatsApp -> Bridge -> Orchestrator -> Kennel -> WhatsApp.

---

## 5. Technical Constraints Summary

* **Hardware:** Any Linux machine (ARM64 or x86_64).
* **OS:** Ubuntu 22.04+, Debian 12+, or compatible.
* **Container Runtime:** Docker Engine.
* **External APIs:** OpenRouter (for Orchestration), Anthropic/Google (for Agents).
* **Cost:** Must rely on free/existing API tiers where possible; No paid SaaS for the architecture itself.

**End of Instructions.**