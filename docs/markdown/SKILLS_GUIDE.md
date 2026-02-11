# Skills Guide

Skills are the mechanism by which you teach Fetch new domain-specific capabilities without modifying the core code. They are essentially **hot-loadable instruction sets** that inject themselves into the context when relevant.

## How Skills Work

The `SkillManager` watches the `data/skills/` directory. When you send a message:

1. **Trigger Matching**: Fetch checks if your message contains any keywords defined in a skill's `triggers`.
2. **Activation**: If matched, the content of the skill's `Instructions` section is injected into the System Prompt.
3. **Execution**: The LLM now "knows" these instructions and follows them for the duration of that turn.

This allows Fetch to be a generalist most of the time, but a specialist (e.g., in React, or Docker, or your specific database schema) exactly when needed.

## Creating a Skill

Create a new Markdown file in `data/skills/` (e.g., `data/skills/nextjs.md`).

### File Format

Skills use YAML frontmatter for metadata and Markdown for the instructions.

```markdown
---
name: Next.js Expert
description: Best practices for Next.js 14+ App Router development
triggers:
  - next.js
  - nextjs
  - app router
  - server component
enabled: true
---

## Instructions

You are an expert in Next.js 14+. Follow these rules when generating code:

1. **App Router Defaults**: Always use the App Router (`app/` directory), not the Pages router.
2. **Server Components**: All components are Server Components by default. Only add `'use client'` when state or effects are strictly necessary.
3. **Data Fetching**: Use `fetch` directly in Server Components. Do not use `useEffect` for data fetching.
4. **Server Actions**: Use Server Actions for mutations (`action={serverAction}`).
5. **Images**: Always use `next/image` with proper width/height or fill.

## Common Pitfalls to Avoid

- Do not use `getStaticProps` or `getServerSideProps` (deprecated in App Router).
- Do not import server-only modules into client components.
```

## Best Practices

### 1. Specific Triggers

Choose triggers that are likely to appear in your request but unique enough to avoid accidental activation.

* **Good**: `tailwind`, `database schema`, `ci/cd pipeline`
* **Bad**: `code`, `help`, `fix` (Too generic, will activate on everything)

### 2. Concise Instructions

The instructions are injected into the prompt, consuming context tokens. Be direct and rule-based.

* **Good**: "Always use `zod` for validation."
* **Bad**: "It is generally considered a good practice in the industry to use validation libraries, and one such library that determines..." (Too verbose)

### 3. Hot-Reloading

You do not need to restart Fetch when adding or editing skills.

1. Create `data/skills/new-skill.md`.
2. Save the file.
3. Immediately send a message to Fetch using one of the triggers.
