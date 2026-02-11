---
name: Testing & QA
description: Test creation, execution, and quality verification.
harnessHint: claude
triggers:
  - test
  - spec
  - e2e
  - unit test
  - integration test
  - vitest
  - jest
  - playwright
  - coverage
---

# Testing & QA Skill

Guide Fetch to orchestrate test writing and execution.

## Instructions

When the user asks to write tests:
1. Call `workspace_status` to identify the test framework (look for vitest.config, jest.config, playwright.config)
2. Delegate to **Claude** via `task_create` — test writing needs understanding of the code being tested
3. Include in the goal: "Write tests following AAA pattern (Arrange, Act, Assert). Use `*.test.ts` naming. Mock external I/O (filesystem, network, Docker)."

When the user asks to run tests:
1. Delegate via `task_create` with the specific test command
2. For this codebase: `npm run test:run` (all), `npm run test:unit` (unit only), `npm run test:integration` (integration only)
3. Use `report_progress` to relay test output as it runs

When the user asks to fix a failing test:
1. Call `workspace_status` to check project state
2. Delegate to **Claude** via `task_create` with the failing test output included in the goal
3. Include: "First understand why the test fails, then fix the code (not the test) unless the test expectation is wrong."

When the user reports a bug:
1. Suggest writing a failing test first to capture the bug
2. Then fix the code to make the test pass
3. Delegate both steps to **Claude** as a single `task_create` goal

## Test Hierarchy

1. **Unit tests** — Fast, isolated, mock all I/O. Test logic variations.
2. **Integration tests** — Test boundaries (DB, Docker, API). Fewer but critical.
3. **E2E tests** — Full user flows via Playwright. Slowest, most valuable.

## Fetch Codebase Specifics

- Framework: Vitest (not Jest)
- Test location: `fetch-app/tests/unit/` and `fetch-app/tests/integration/`
- Naming: `*.test.ts`
- Mocks: `vi.mock()`, `vi.fn()`, `vi.spyOn()`
- Run: `cd fetch-app && npm run test:run`

## Harness Routing

- Test writing → **Claude** (needs code understanding, thoroughness)
- Running tests → **Gemini** (just executing commands, fast)
- Test debugging → **Claude** (needs reasoning about failures)

## Tool Reference

- `workspace_status` — Check project structure and test framework
- `task_create` — Delegate test writing/running/fixing to a harness
- `report_progress` — Relay test output during execution
- `ask_user` — Clarify what to test if the request is ambiguous
