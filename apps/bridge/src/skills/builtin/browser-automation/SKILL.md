---
name: Browser Automation
description: Interactive browser navigation, page interaction, and visual verification.
triggers:
  - open browser
  - click
  - fill form
  - navigate site
  - screenshot page
  - browser test
  - web ui
  - playwright
---

# Browser Automation Skill

Use this skill when the task needs JS-rendered pages or interactive UI actions.

## Instructions

Baseline flow:
1. Call `browser_open` with URL and appropriate `waitUntil`.
2. Call `browser_snapshot` to inspect available element refs.
3. Use `browser_action` with those refs (`click`, `type`, scroll, back/forward).
4. Re-run `browser_snapshot` after each state-changing action.
5. Use `browser_screenshot` when visual confirmation is required.

Interaction rules:
1. Never invent ref numbers; always use values from the latest snapshot.
2. If an element is missing, refresh snapshot before retrying.
3. Keep action sequences short and report progress after meaningful milestones.

## Tool Reference

- `browser_open`
- `browser_snapshot`
- `browser_action`
- `browser_screenshot`
