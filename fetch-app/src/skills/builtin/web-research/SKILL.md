---
name: Web Research
description: Search and fetch public web content for docs, references, and error research.
triggers:
  - search web
  - look up
  - docs
  - documentation
  - research
  - investigate
  - find source
  - web
---

# Web Research Skill

Use this skill for documentation lookup and factual web research.

## Instructions

For discovery:
1. Start with `web_search` using a focused query.
2. Return top results with short rationale when user asks for recommendations.

For source reading:
1. Use `web_fetch` on selected URLs.
2. If only part of a page is needed, pass `selector` to `web_fetch`.
3. Summarize findings with links and explicitly mark uncertainty.

When results are weak:
1. Refine query terms and run `web_search` again.
2. Prefer official documentation, specifications, or primary sources.

## Tool Reference

- `web_search`
- `web_fetch`
