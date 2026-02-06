# 🐺 Pack Routing Rules

> **Purpose:** Shared routing configuration for harness selection.
> Individual agent profiles live in their own files (claude.md, gemini.md, copilot.md).
> This file defines cross-cutting routing behavior.

---

## Automatic Selection (Default Behavior)

When the Alpha doesn't specify a harness, Fetch selects based on task characteristics.
Each agent file defines `triggers` (signals that route TO this agent) and `avoid`
(signals that route AWAY from this agent). The routing table below is a human-readable
summary derived from those frontmatter fields.

| Signal | Route To | Reason |
|--------|----------|--------|
| Multi-file mentions | **Claude** | Needs broad context |
| "refactor", "restructure", "architect" | **Claude** | Complex reasoning required |
| "explain", "what does", "how does" | **Gemini** | Fast explanation |
| "quick fix", "typo", "rename" | **Gemini** | Speed over depth |
| "add test", "write tests" | **Claude** | Thoroughness matters |
| "git", "gh", "github", "PR" | **Copilot** | GitHub integration |
| "command for", "how to" (shell) | **Copilot** | Command suggestion |
| Default / ambiguous | **Claude** | Safest default for code tasks |

## Manual Override

The Alpha can force a specific harness:
- `@fetch use claude: <task>` — Force Claude
- `@fetch use gemini: <task>` — Force Gemini
- `@fetch use copilot: <task>` — Force Copilot

## Fallback Chain

If the selected harness is unavailable (not enabled, auth expired, rate limited):
1. Try the next best harness by `fallback_priority` (lower = try first)
2. If all harnesses unavailable, report to Alpha with diagnostic info
3. Never silently fall back — always inform which harness is handling the task

## Delegation Protocol

1. **Fetch** (The Orchestrator) classifies the intent and selects the harness
2. Fetch frames the task as a clear, self-contained goal for the harness
3. The harness executes autonomously within the workspace
4. Fetch summarizes the result for the Alpha in WhatsApp-friendly format
5. If the harness asks a question, Fetch relays it to the Alpha via `ask_user`

## Error Handling

- If a Pack member fails, Fetch does NOT automatically retry with a different member
- Instead, Fetch reports the failure and suggests alternatives
- The Alpha decides whether to try again or switch strategies
