# 🚀 Fetch: Future Roadmap & Suggestions

Based on the comprehensive technical review of Fetch v4.0.0, here is a consolidated list of suggestions for future development, organized by impact and effort.

---

## 🛠️ Architecture & Tools

### 1. Automated `/undo` & Deterministic Rollback

- **Suggestion:** Enhance the `/undo` escape command to actually execute `git revert HEAD` or a soft reset instead of just suggesting the command.
- **Why:** In an emergency, every second counts.
- **Effort:** Low | **Impact:** Medium

### 2. Autonomous `undo_last_step` Tool

- **Suggestion:** Add a tool for the LLM itself to roll back recent local changes if it detects a failure or error in its own logic.
- **Why:** Allows the agent to self-correct without needing user intervention for every mistake.
- **Effort:** Medium | **Impact:** High

### 3. Tool Batching

- **Suggestion:** Allow the `ToolRegistry` to accept an array of safe tool calls and execute them in a single round-trip.
- **Why:** Reduces latency and token overhead for common patterns (e.g., `workspace_list` followed by `workspace_status`).
- **Effort:** Medium | **Impact:** Medium

---

## 🧠 Intelligence & Skills

### 4. Vector Memory (Long-term RAG)

- **Suggestion:** Implement a Retrieval-Augmented Generation (RAG) layer using a vector database (e.g., SQLite with `sqlite-vec`).
- **Why:** Currently, context is limited to a sliding window. Vector memory would allow Fetch to "remember" architectural decisions across months of work.
- **Effort:** High | **Impact:** Massive

### 5. Skill Parameterization (Tools-in-Skills)

- **Suggestion:** Allow `SKILL.md` to register temporary, domain-specific tools or environment variables when activated.
- **Why:** For example, a React skill could register a `react_component_analyze` tool that is only available when working on UI code.
- **Effort:** Medium | **Impact:** Medium

### 6. Dynamic Persona Modes

- **Suggestion:** Allow the Alpha to adjust the "Collar" (autonomy level) via WhatsApp (e.g., `/autonomy 100` vs `/autonomy cautious`).
- **Why:** Fluctuates between "just do it" for trivial tasks and "ask first" for high-risk refactors.
- **Effort:** Low | **Impact:** High

---

## 🖥️ Management & Developer Experience

### 7. Telemetry & Analytics Dashboard

- **Suggestion:** Add a new screen to the Go TUI (`manager`) that shows token usage, task success rates, and average latency trends.
- **Why:** Helps the Alpha monitor costs and performance over time.
- **Effort:** Medium | **Impact:** Medium

### 8. Formal Plugin System

- **Suggestion:** Move from `src/skills` to a fully externalized plugin system where skills can be packaged as NPM modules.
- **Why:** Encourages community contributions and keeps the core bridge lean.
- **Effort:** High | **Impact:** Medium

---

## 🏁 Summary Verdict

Fetch is already a "Good Boy" 🐕, but implementing **Vector Memory** and **Autonomous Rollback** would transform it from a reactive assistant into a truly proactive engineering partner.

---
> "Wagging my tail at all these possibilities! Ready whenever you are, Alpha."
