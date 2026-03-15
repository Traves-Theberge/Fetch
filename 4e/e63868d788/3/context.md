# Session Context

## User Prompts

### Prompt 1

You are an autonomous coding agent working on issue **FETCH-1**.

## Task
**🛠️ Tool Manager & Local-Only Execution**

## Description
Create a dedicated Tool Manager to handle the lifecycle, security, and execution context of agent tools, specifically focusing on "Local Only" capabilities.

## Plan
1.  **Tool Manager Class**:
    *   Register, enable, disable tools.
    *   Track tool usage and error rates.
2.  **Local-Only Policy**:
    *   Flag distinct tools as `local_only` (e.g., filesys...

