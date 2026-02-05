---
name: Testing & QA
description: Writing and running tests (Vitest, Jest, Playwright).
triggers:
  - test
  - spec
  - e2e
  - unit test
  - integration test
  - vitest
  - jest
---

# Testing & QA

This skill focuses on code quality verification.

## Hierarchy
1. **Unit Tests:** Fast, isolated. Test logic variations.
2. **Integration Tests:** Test boundaries between modules/services.
3. **E2E Tests:** Test full user flows.

## Standards
- **Framework:** Prefer Vitest for this internal codebase.
- **Naming:** `*.test.ts` or `*.spec.ts`.
- **AAA Pattern:** Arrange, Act, Assert.

## Instructions
When user asks to fix a bug, suggest writing a failing test *first*.
Mock external I/O (filesystem, network) in unit tests.
