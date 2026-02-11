---
name: TypeScript Development
description: TypeScript coding standards and task delegation for the Fetch codebase.
harnessHint: claude
triggers:
  - typescript
  - tsconfig
  - type definition
  - strict mode
  - type error
  - TS2345
  - TS2322
---

# TypeScript Development Skill

Guide Fetch to delegate TypeScript tasks with proper standards enforced.

## Instructions

When the user reports a type error or asks to fix TypeScript issues:
1. Call `workspace_status` to confirm the active workspace
2. Delegate to **Claude** via `task_create` with the error details and file context
3. Include in the goal: "Fix the TypeScript error. Use strict types — avoid `any`. Use `unknown` or specific types."

When the user asks to create new TypeScript files or modules:
1. Delegate to **Claude** via `task_create` with specific requirements
2. Include these standards in the goal:
   - `strict: true` mode compliance
   - ESM imports (`import/export`, not `require`)
   - Interfaces for public contracts, type aliases for unions/primitives
   - Descriptive generic names (`TItem`, `TResponse`) not just `T`

When the user asks to refactor TypeScript code:
1. Call `workspace_status` to understand the project scope
2. For multi-file refactors → **Claude** (broad context, deep reasoning)
3. For single-file fixes → **Gemini** (fast, focused)

## Fetch Codebase Conventions

- ESM throughout — `"type": "module"` in package.json, NodeNext resolution
- Zod for runtime validation (tool inputs, env vars)
- Each source file should have `@fileoverview` and `@module` JSDoc annotations
- `noUnusedLocals` and `noUnusedParameters` enforced

## Harness Routing

- Type errors, refactoring, multi-file changes → **Claude**
- Quick fixes, rename, single-file edits → **Gemini**
- Never route TypeScript work to Copilot (limited context window)

## Tool Reference

- `workspace_status` — Check project state before delegating
- `task_create` — Delegate TypeScript work to a harness
- `web_search` — Look up TypeScript error codes or patterns if needed
