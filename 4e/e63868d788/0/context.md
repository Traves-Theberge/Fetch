# Session Context

## User Prompts

### Prompt 1

You are an autonomous coding agent working on issue **FETCH-2**.

## Task
**📦 Containerization & Sandboxing**

## Description
Improve the security and isolation of task execution environments.

## Plan
1.  **Kennel Enhancements**:
    *   Ensure the `fetch-kennel` Docker container allows no network egress (except whitelist).
    *   Ephemeral containers for high-risk tasks.
2.  **Sandboxing**:
    *   Use `vm2` or similar for executing JS code snippets internally if not using Docker.
3.  **Re...

