---
name: React Development
description: React component development standards and task delegation.
harnessHint: claude
triggers:
  - react
  - component
  - hook
  - jsx
  - tsx
  - state management
  - next.js
  - nextjs
---

# React Development Skill

Guide Fetch to delegate React tasks with modern patterns enforced.

## Instructions

When the user asks to create or modify React components:
1. Call `workspace_status` to confirm the active workspace and framework (React, Next.js, etc.)
2. Delegate via `task_create` to **Claude** with these standards included in the goal:
   - Functional components with hooks (no class components)
   - Server Components by default if using Next.js App Router
   - Only add `'use client'` when state or effects are strictly necessary
   - Composition over inheritance

When the user asks about state management:
1. Use `ask_user` to clarify the scope (local state, global state, server state)
2. Delegate to **Claude** — state architecture needs careful reasoning

When the user asks to add a new page or route:
1. Check if the project uses Next.js App Router, Pages Router, or plain React Router
2. Include the routing convention in the `task_create` goal

## Standards to Include in Task Goals

- Components: `PascalCase.tsx`
- Hooks: `useHookName.ts`
- Ensure `useEffect` dependencies are exhaustive
- Use `useMemo` / `useCallback` only where measurably needed
- Prefer Server Components (Next.js) — use `fetch` in RSCs, not `useEffect`

## Harness Routing

- New components, architectural decisions → **Claude** (needs project context)
- Quick UI tweaks, styling changes → **Gemini** (fast iteration)
- Never route React work to Copilot (limited context)

## Tool Reference

- `workspace_status` — Check project structure and framework
- `task_create` — Delegate React work to a harness
- `web_search` — Look up React patterns or library docs
- `web_fetch` — Fetch specific documentation pages
