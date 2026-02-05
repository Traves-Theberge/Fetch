# Code Audit Checklist

## Instructions
For each file in the source code, verify the following:
1.  **Proper Comments**: Does the code contain JSDoc/TSDoc comments for exported functions and classes? Are complex logic sections explained?
2.  **Dead Code**: Are there unused variables, imports, or functions? Is there commented-out code that should be removed?
3.  **Old Code**: Are there deprecated patterns or vestiges of previous architecture versions (e.g., "Instincts" vs "Reflexes")?
4.  **Action Taken**: If issues are found, fix them and mark the action taken.

| File Path | Status | Comments? | Dead Code? | Action Items / Notes |
| :--- | :--- | :--- | :--- | :--- |
| src/agent/core.ts | ⚠️ Issue | ✅ | ❌ | Uses `Instinct` terminology. Needs update to `Reflex`. References `src/instincts`. |
| src/agent/format.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/agent/index.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/agent/intent.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/agent/prompts.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/agent/whatsapp-format.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/api/status.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/bridge/client.ts | Pending | | | |
| src/commands/index.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/commands/parser.ts | ✅ Pass | ✅ | ✅ | Clean. Implements V3.1 features properly. |
| src/commands/trust.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/conversation/detector.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/conversation/summarizer.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/conversation/thread.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/conversation/types.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/executor/docker.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/handler/index.ts | ⚠️ Issue | ✅ | ⚠️ | Commented out imports/code (lines 15, 49, 98). Comment ref to "instincts". |
| src/harness/claude.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/copilot.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/executor.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/gemini.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/index.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/output-parser.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/pool.ts | Pending | | | |
| src/harness/registry.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/harness/spawner.ts | Pending | | | |
| src/harness/types.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/identity/loader.ts | Pending | | | |
| src/identity/manager.ts | Pending | | | |
| src/identity/types.ts | Pending | | | |
| src/index.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/instincts/commands.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/help.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/identity.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/index.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/safety.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/scheduling.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/skills.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/status.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/thread.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/tools.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/types.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/instincts/whoami.ts | ⚠️ Issue | ? | ? | **REFACTOR**: Rename folder `src/instincts` -> `src/reflexes`. |
| src/memory/index.ts | Pending | | | |
| src/modes/index.ts | Pending | | | |
| src/modes/manager.ts | Pending | | | |
| src/modes/types.ts | Pending | | | |
| src/security/gate.ts | ✅ Pass | ✅ | ✅ | Clean. Excellent comments. |
| src/security/index.ts | Pending | | | |
| src/security/rateLimiter.ts | Pending | | | |
| src/security/validator.ts | Pending | | | |
| src/security/whitelist.ts | Pending | | | |
| src/session/index.ts | Pending | | | |
| src/session/manager.ts | Pending | | | |
| src/session/store.ts | ✅ Pass | ✅ | ✅ | Clean. Features V3.1 DB changes. |
| src/task/index.ts | Pending | | | |
| src/task/manager.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/task/store.ts | Pending | | | |
| src/tools/index.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/tools/interaction.ts | Pending | | | |
| src/tools/registry.ts | ⚠️ Issue | ✅ | ⚠️ | `orchestratorTools` deprecated. `// Removed Tool` comment. |
| src/tools/workspace.ts | ✅ Pass | ✅ | ✅ | Clean. |
| src/workspace/manager.ts | ✅ Pass | ✅ | ✅ | Clean. |
