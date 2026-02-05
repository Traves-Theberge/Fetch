---
name: TypeScript Development
description: Helper for TypeScript configuration, strictness, and strict typing.
triggers:
  - typescript
  - tsconfig
  - interface
  - type definition
  - strict mode
---

# TypeScript Development

This skill enforces high-quality TypeScript standards.

## Standards
- **Strictness:** `strict: true` in `tsconfig.json`.
- **Any:** Avoid `any`. Use `unknown` or specific types.
- **Imports:** Use explicit imports and exports. Prefer ESM syntax.

## Patterns
- **Interfaces vs Types:** Use interfaces for public contracts, types for unions/primitives.
- **Generics:** Use descriptive names (`TItem`, `TResponse`) rather than just `T`.

## Instructions
When adding new files, ensure they are included in `tsconfig.json` or the relevant project reference.
Resolving `TS2345` (Argument of type...) is usually about validation, not casting.
