# 🛠️ Fetch Commands & Tools Detail Review

This document provides a technical deep-dive into the interface surface of Fetch v4.0.0, covering both deterministic "safety-gate" commands and the LLM tool belt.

---

## 🛑 Escape Hatch Commands (Deterministic)

These commands bypass the LLM and are handled directly by the `commands/parser.ts`. They are designed for speed and reliability.

| Command | Action | Implementation Detail | Review Note |
|:---|:---|:---|:---|
| `/stop`, `/cancel` | Kill active task | Calls `taskManager.cancelTask(id)` which signals the harness process. | **CRITICAL:** Essential for preventing run-away token usage. Implementation is solid. |
| `/undo` | Git Revert Suggestion | Returns a string instruction. | **IMPROVEMENT:** Could be automated in v4.1 to actually execute the revert if in a git workspace. |
| `/undo all` | Hard Git Reset | Executes `git reset --hard` to the session's start commit hash. | **DANGEROUS:** Handled with regex safety and session start-point tracking. Very reliable. |
| `/clear`, `/reset` | Session Wipe | Clears `messages`, `activeFiles`, and `activeTaskId`. | **CLEAN:** Effectively "reboots" the LLM's memory without reloading the app. |
| `/status`, `/st` | System Health | Aggregates data from session, agent, and task manager. | **USEFUL:** Provides immediate context on which agent/model is active. |
| `/help`, `/h`, `/?` | User Education | Returns the v4.0 command manual. | **DX:** Well-formatted for WhatsApp mobile viewing. |

---

## 🧰 Orchestrator Tool Belt (LLM-Controlled)

These tools are the "hands" of the Fetch agent. They are registered in `tools/registry.ts` and validated with Zod.

### 📁 Workspace Tools

- **`workspace_list`**: The entry point for context. Clean JSON output.
- **`workspace_select`**: Primary navigation tool. Correctly handles ID vs. Name resolution.
- **`workspace_status`**: Provides "git-aware" context. Essential for the LLM to know what it has already changed.
- **`workspace_create`**: Supports multiple templates (Node, Python, React, etc.). Solid scaffolding logic.
- **`workspace_delete`**: **SAFETY FIRST.** Implementation requires `confirm: true` and the tool description explicitly tells the LLM to ask the user first.
- **`workspace_sync`**: One-click backup. Impressive implementation that handles local commit AND remote repository creation/push in one call.

### 📝 Task Tools

- **`task_create`**: The bridge to autonomy. Spawns background harnesses. Includes "Goal Framing" logic to make the task self-contained.
- **`task_status`**: Polls background progress. Updates the user on percent completion.
- **`task_cancel`**: LLM-driven termination. Good for autonomous correction if it realizes it's on the wrong path.
- **`task_respond`**: How the LLM pipes user answers back to a waiting harness (via stdin). Robust process communication.

### 🗣️ Interaction Tools

- **`ask_user`**: The most complex interaction tool.
  - **AUTONOMY LOGIC:** Includes regex patterns to detect and skip "unnecessary confirmations" (e.g., "Would you like me to proceed?") at higher autonomy levels. This is a high-IQ feature.
- **`report_progress`**: Keeps the WhatsApp interface "alive" during long-running tasks.

---

## ⚖️ Technical Verdict

The interface surface is **exceptionally well-designed**.

### Strengths

1. **Zod Validation:** Every tool input is strictly validated before execution.
2. **Separation of Concerns:** Commands cover "I'm scared, stop" while tools cover "I'm working, here is progress".
3. **Autonomy Management:** The `autonomyLevel` integration in `ask_user` prevents the "confirmation fatigue" common in AI assistants.

### Suggested Improvements

- **`undo_last_step`**: A tool for the LLM itself to roll back recent local changes without a full `/undo all`.
- **`tool_batching`**: Allowing the registry to execute a sequence of safe tools to reduce round-trips.

---
🐕 *Fetch: Barking out commands, fetching the code.*
