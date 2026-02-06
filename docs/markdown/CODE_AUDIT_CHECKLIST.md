# Code Audit Checklist

## Instructions
For each file in the source code, verify the following:
1.  **Proper Comments**: Does the code contain JSDoc/TSDoc comments for exported functions and classes? Are complex logic sections explained?
2.  **Dead Code**: Are there unused variables, imports, or functions? Is there commented-out code that should be removed?
3.  **Old Code**: Are there deprecated patterns or vestiges of previous architecture versions (e.g., "Instincts" vs "Reflexes")?
4.  **Action Taken**: If issues are found, fix them and mark the action taken.

| File Path | Status | Comments? | Dead Code? | Action Items / Notes |
| :--- | :--- | :--- | :--- | :--- |
| src/agent/core.ts | Passed | Yes | No | v3.2.0: Updated to use IdentityManager.buildSystemPrompt() |
| src/agent/format.ts | Passed | Yes | No | 6 dead exports removed (formatApprovalRequest, formatTaskComplete, formatTaskFailed, formatProgress, formatQuestion, formatThinking) |
| ~~src/agent/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/agent/intent.ts | Passed | Yes | No | Audit complete |
| src/agent/prompts.ts | Passed | Yes | No | v3.2.0: Gutted from 571→153 lines. Static prompts removed; now tool defs + schema helpers only |
| src/agent/whatsapp-format.ts | Passed | Yes | No | Audit complete |
| src/api/status.ts | Passed | Yes | No | Audit complete |
| src/bridge/client.ts | Passed | Yes | No | Audit complete |
| ~~src/commands/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/commands/parser.ts | Passed | Yes | No | Audit complete |
| src/commands/trust.ts | Passed | Yes | No | Audit complete |
| src/conversation/detector.ts | Passed | Yes | No | Audit complete |
| src/conversation/summarizer.ts | Passed | Yes | No | Audit complete |
| src/conversation/thread.ts | Passed | Yes | No | Audit complete |
| src/conversation/types.ts | Passed | Yes | No | Audit complete |
| ~~src/executor/docker.ts~~ | Deleted | — | — | Dead code: never imported |
| src/handler/index.ts | Passed | Yes | No | Instinct terminology verified |
| src/harness/claude.ts | Passed | Yes | No | Audit complete |
| src/harness/copilot.ts | Passed | Yes | No | Audit complete |
| src/harness/executor.ts | Passed | Yes | No | Audit complete |
| src/harness/gemini.ts | Passed | Yes | No | Audit complete |
| ~~src/harness/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/harness/output-parser.ts | Passed | Yes | No | Audit complete |
| src/harness/pool.ts | Passed | Yes | No | Audit complete |
| src/harness/registry.ts | Passed | Yes | No | Audit complete |
| src/harness/spawner.ts | Passed | Yes | No | Audit complete |
| src/harness/types.ts | Passed | Yes | No | Audit complete |
| src/identity/loader.ts | Passed | Yes | No | v3.2.0: Added loadAgents() for data/agents/*.md with gray-matter YAML parsing |
| src/identity/manager.ts | Passed | Yes | No | v3.2.0: buildSystemPrompt() now single source of truth; watches data/agents/ |
| src/identity/types.ts | Passed | Yes | No | v3.2.0: Added PackMember interface (13 fields), removed SystemPromptConfig |
| src/index.ts | Passed | Yes | No | Audit complete |
| src/instincts/commands.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/help.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/identity.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/index.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/safety.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/scheduling.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/skills.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/status.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/thread.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/tools.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/types.ts | Passed | Yes | No | Instinct terminology verified |
| src/instincts/whoami.ts | Passed | Yes | No | Instinct terminology verified |
| ~~src/memory/index.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/memory/manager.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/memory/types.ts~~ | Deleted | — | — | Dead module: never imported |
| src/modes/handlers/alert.ts | Passed | Yes | No | Instinct terminology verified |
| src/modes/handlers/guarding.ts | Passed | Yes | No | Audit complete |
| src/modes/handlers/waiting.ts | Passed | Yes | No | Audit complete |
| src/modes/handlers/working.ts | Passed | Yes | No | Audit complete |
| src/modes/index.ts | Passed | Yes | No | Audit complete |
| src/modes/manager.ts | Passed | Yes | No | Audit complete |
| src/modes/types.ts | Passed | Yes | No | Audit complete |
| src/proactive/commands.ts | Passed | Yes | No | Audit complete |
| src/proactive/index.ts | Passed | Yes | No | Audit complete |
| src/proactive/loader.ts | Passed | Yes | No | Audit complete |
| src/proactive/polling.ts | Passed | Yes | No | Audit complete |
| src/proactive/types.ts | Passed | Yes | No | Audit complete |
| src/proactive/watcher.ts | Passed | Yes | No | Audit complete |
| ~~src/retrieval/bm25.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/retrieval/hybrid.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/retrieval/index.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/retrieval/repomap.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/retrieval/semantic.ts~~ | Deleted | — | — | Dead module: never imported |
| ~~src/retrieval/types.ts~~ | Deleted | — | — | Dead module: never imported |
| src/security/gate.ts | Passed | Yes | No | Audit complete |
| src/security/index.ts | Passed | Yes | No | Audit complete |
| src/security/rateLimiter.ts | Passed | Yes | No | Audit complete |
| src/security/validator.ts | Passed | Yes | No | Audit complete |
| src/security/whitelist.ts | Passed | Yes | No | Audit complete |
| ~~src/session/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/session/manager.ts | Passed | Yes | No | Audit complete |
| src/session/project.ts | Passed | Yes | No | Audit complete |
| src/session/store.ts | Passed | Yes | No | Audit complete |
| src/session/thread-manager.ts | Passed | Yes | No | Audit complete |
| src/session/types.ts | Passed | Yes | No | Dead SessionSummary and Database interfaces removed |
| ~~src/skills/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/skills/loader.ts | Passed | Yes | No | Audit complete |
| src/skills/manager.ts | Passed | Yes | No | v3.2.0: Two-phase discovery→activation; buildContextSection() wired |
| src/skills/types.ts | Passed | Yes | No | Audit complete |
| ~~src/task/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/task/integration.ts | Passed | Yes | No | Audit complete |
| src/task/manager.ts | Passed | Yes | No | Audit complete |
| src/task/queue.ts | Passed | Yes | No | Audit complete |
| src/task/scheduler.ts | Passed | Yes | No | Audit complete |
| src/task/store.ts | Passed | Yes | No | Dead cron_jobs table DDL removed |
| src/task/types.ts | Passed | Yes | No | Audit complete |
| ~~src/tools/index.ts~~ | Deleted | — | — | Dead barrel: never imported |
| src/tools/interaction.ts | Passed | Yes | No | Audit complete |
| src/tools/loader.ts | Passed | Yes | No | Audit complete |
| src/tools/registry.ts | Passed | Yes | No | v3.2.0: Updated to use IdentityManager for prompt assembly |
| src/tools/task.ts | Passed | Yes | No | Audit complete |
| src/tools/types.ts | Passed | Yes | No | Rebuilt: kept only ToolResult + DangerLevel (30 dead exports removed) |
| src/tools/workspace.ts | Passed | Yes | No | Audit complete |
| src/transcription/index.ts | Passed | Yes | No | Audit complete |
| src/types/qrcode-terminal.d.ts | Passed | Yes | No | Audit complete |
| src/utils/docker.ts | Passed | Yes | No | Audit complete |
| src/utils/id.ts | Passed | Yes | No | 10 dead exports removed (SessionId, MessageId, ProgressId types + 5 validators + 2 generators) |
| src/utils/logger.ts | Passed | Yes | No | Audit complete |
| ~~src/utils/sanitize.ts~~ | Deleted | — | — | Dead code: never imported |
| ~~src/utils/stream.ts~~ | Deleted | — | — | Dead code: never imported |
| src/validation/common.ts | Passed | Yes | No | Audit complete |
| src/validation/tools.ts | Passed | Yes | No | Audit complete |
| src/vision/index.ts | Passed | Yes | No | Audit complete |
| src/workspace/manager.ts | Passed | Yes | No | Audit complete |
| src/workspace/repo-map.ts | Passed | Yes | No | Audit complete |
| src/workspace/symbols.ts | Passed | Yes | No | Audit complete |
| src/workspace/types.ts | Passed | Yes | No | Audit complete |
