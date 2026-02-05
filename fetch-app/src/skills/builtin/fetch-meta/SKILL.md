---
name: Fetch Meta
description: Capabilities for Fetch to manage itself, its configuration, and its memory.
triggers:
  - update configuration
  - change preference
  - what can you do
  - system status
  - reload skills
---

# Fetch Meta Skill

This skill allows Fetch to perform meta-operations on itself.

## Capabilities

1. **Configuration Management**
   - Read/write `PREFERENCES.md`
   - Update user preferences (autonomy, verbose mode)

2. **Memory Management**
   - Explicitly add facts to memory
   - Forget specific facts cleanup

3. **System Control**
   - Reload skills (`/reload`)
   - Check health status

## Instructions

When the user asks to change a preference:
1. Check `docs/markdown/PREFERENCES.md` (or the equivalent data file)
2. Update the value
3. Confirm the change

When asked 'what can you do', list enabled skills and available tools.
