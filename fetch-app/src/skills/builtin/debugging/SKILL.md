---
name: Debugging
description: Strategies for diagnosing and fixing issues.
triggers:
  - debug
  - error
  - fix
  - broken
  - crash
  - why is this failing
---

# Debugging Strategy

This skill provides a structured approach to problem-solving.

## Process
1. **Isolate:** Reproduce the issue with minimal code.
2. **Observe:** Add logs or use debugger to check state.
3. **Hypothesize:** What is causing the state mismatch?
4. **Experiment:** Test the hypothesis.
5. **Fix & Verify:** Apply fix and run regression tests.

## Tools
- **Logging:** `logger.debug()` is your friend.
- **Node Inspector:** `node --inspect`.

## Instructions
When analyzing a stack trace, look for the first line within our codebase.
Suggest adding detailed logging around the failure point before making code changes if the cause is unclear.
