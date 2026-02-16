# Conversational Experience Plan

## Implementation References

- Response pipeline: `fetch-app/src/handler/index.ts`, `fetch-app/src/agent/core.ts`, `fetch-app/src/agent/whatsapp-format.ts`.
- Prompt assembly and identity voice: `fetch-app/src/identity/manager.ts`, `fetch-app/src/agent/prompts.ts`.
- Deterministic command fallback: `fetch-app/src/commands/parser.ts`, `fetch-app/src/agent/format.ts`.
- Skills routing: `fetch-app/src/skills/manager.ts`, `fetch-app/src/skills/builtin/**/SKILL.md`.
- Runtime metrics/status: `fetch-app/src/api/status.ts`.

## Objective

Make Fetch responses feel personal, agentic, and WhatsApp-native while staying reliable for tool execution.

Success means:
- capability questions are concise and human, not a giant catalog
- tool inventories are structured and skimmable
- output formatting is stable on mobile (no broken markdown or collapsed bullets)
- the agent keeps a consistent identity voice across chat, progress, and completion updates

## External Pattern Review

From modern agent-system best practices, the strongest reusable patterns are:

1. Prompt stack separation: explicit identity, behavior rules, and operating constraints in a structured system prompt.
2. Skill-guided orchestration: trigger-matched skills injected as procedural instructions for tool sequencing.
3. Deterministic agent loop: bounded execution flow with clear step limits and tool call handling.
4. Context discipline: layered context loading with explicit focus on relevance and bounded token budgets.

## Fetch Gap Analysis (Current)

1. Capability/tool answers can over-expand and degrade readability on WhatsApp.
2. Response style is not contract-driven by intent type (greeting vs capabilities vs execution update).
3. Formatting cleanup is mostly transport-level and not fully coupled to conversational intent.
4. No explicit quality gates for "how it reads" across common user asks.

## Target Interaction Contract

```mermaid
flowchart LR
  A[Incoming User Message] --> B[Intent Classifier]
  B --> C[Response Policy]
  C --> D[Agent/Tool Execution]
  D --> E[WhatsApp Renderer]
  E --> F[Delivery + Telemetry]
```

Intent classes:
- Greeting/Social
- Capability Summary
- Tool Inventory
- Action Request
- Progress/Status
- Error/Recovery

Per class define:
- max length
- preferred structure (plain sentence vs bullets)
- allowed markdown (WhatsApp-safe only)
- mandatory final line (clear next action)

## Implementation Plan

### Phase 1 - Response Policy Layer

Goal: classify requests before generation and enforce an output contract.

Changes:
- Add `fetch-app/src/agent/response-policy.ts`:
  - `classifyIntent(message)`
  - `buildOutputConstraints(intent)`
  - `shouldUseMinimalMode(intent)`
- Integrate policy in `fetch-app/src/agent/core.ts` before LLM call.
- Keep `selectPromptMode()` as fallback; response policy becomes the primary selector.

Acceptance criteria:
- "what can you do?" always returns concise capability summary + next action.
- "what tools do you have?" returns grouped inventory with compact bullets.

### Phase 2 - Capability and Tool Views

Goal: stop relying on free-form generation for inventory-style responses.

Changes:
- Add `fetch-app/src/agent/capability-cards.ts`:
  - `buildCapabilitySummary()`
  - `buildToolInventory({ short|full })`
- Source categories from `fetch-app/src/validation/tools.ts` + deterministic slash commands.
- Update system prompt in `fetch-app/src/identity/manager.ts` to prefer these views for capability/tool asks.

Acceptance criteria:
- deterministic structure for capability/tool responses
- no duplicate categories
- no stale tool naming drift

### Phase 3 - WhatsApp Renderer v2

Goal: guarantee clean, readable output on mobile.

Changes:
- Extend `fetch-app/src/agent/whatsapp-format.ts`:
  - normalize markdown to WhatsApp-safe emphasis
  - enforce bullet boundaries
  - avoid wrapped label fragments
  - add chunking strategy for long inventories
- Add optional `formatForWhatsAppByIntent(text, intent)` to tune wrapping/chunking.

Acceptance criteria:
- no raw `**bold**` in final user-visible output
- no collapsed multi-bullet paragraphs
- long tool lists split into readable chunks

### Phase 4 - Personalization and Voice Consistency

Goal: make replies feel like one agent, not mixed templates.

Changes:
- Add user response prefs in session metadata:
  - `tone: direct|conversational`
  - `detail: brief|standard|deep`
  - `emoji: low|normal`
- Apply prefs in:
  - normal replies (`agent/core.ts`)
  - notifications (`agent/notifications.ts`)
  - status/help formatting (`agent/format.ts`)

Acceptance criteria:
- user preference persists across turns
- wording and density are consistent across message types

### Phase 5 - Quality Gates, Telemetry, and Regression Tests

Goal: prevent backslide.

Changes:
- Add snapshot/golden tests:
  - `what can you do`
  - `what tools do you have`
  - `status + progress + completion`
- Add response quality counters in `fetch-app/src/api/status.ts`:
  - formatting normalization count
  - chunking count
  - fallback-template count
- Document examples in `docs/markdown/TESTING_GUIDE.md`.

Acceptance criteria:
- CI fails on response contract regressions
- runtime endpoint exposes conversational quality metrics

## Implementation Checklist

1. Add response policy module and wire into `processMessage()`.
2. Add deterministic capability/tool card builders.
3. Upgrade renderer with per-intent formatting/chunking.
4. Add session preference schema + defaults.
5. Update prompt guidance and docs for new contracts.
6. Add unit/integration tests for canonical user prompts.
7. Add runtime status counters.
8. Update docs + changelog in same PR as code changes.

## Test Plan

Core tests to add:
- `tests/unit/response-policy.test.ts`
- `tests/unit/capability-cards.test.ts`
- `tests/unit/whatsapp-format.test.ts` (expand current suite)
- `tests/integration/conversation-contracts.test.ts`

Manual WhatsApp script:
1. `@fetch what can you do?`
2. `@fetch what tools do you have?`
3. `@fetch show full tool list`
4. `@fetch help me ship this repo`
5. `@fetch be brief from now on`
6. `@fetch run tests and summarize`

Expected:
- clear structure
- no markdown artifacts
- one explicit next action
- consistent tone across all six prompts

## Rollout Strategy

1. Ship behind feature flag: `FETCH_RESPONSE_POLICY_V2=true`.
2. Enable in dev only for 48 hours.
3. Compare before/after transcripts.
4. Enable by default and keep old mode fallback for one release.
5. Remove old path after one stable release with no regressions.
