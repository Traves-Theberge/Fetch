---
name: React Development
description: React patterns, hooks, and component structure.
triggers:
  - react
  - component
  - hook
  - jsx
  - tsx
  - state management
---

# React Development

This skill guides React component creation and management.

## Principles
- **Functional Components:** Use function components with hooks.
- **Hooks Rules:** Only call hooks at the top level.
- **Composition:** Prefer composition over inheritance.

## Naming
- Components: `PascalCase.tsx`
- Hooks: `useHookName.ts`
- Utils: `camelCase.ts`

## Instructions
When suggesting state updates, ensure immutability.
Avoid heavy computations in render; suggest `useMemo`.
Ensure `useEffect` dependencies are exhaustive.
