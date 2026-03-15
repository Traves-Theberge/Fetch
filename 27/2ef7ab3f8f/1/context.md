# Session Context

## User Prompts

### Prompt 1

You are an autonomous coding agent working on issue **FETCH-4**.

## Task
**📨 Expanded Messaging Channels (Slack, Telegram, Discord)**

## Description
Expand Fetch's communication capabilities beyond WhatsApp to support professional chat platforms. This allows teams to use Fetch in their existing workflows.

## Plan
1.  **Abstract Bridge Layer**: Refactor `src/bridge/` to support multiple providers (currently tightly coupled to `whatsapp-web.js`).
2.  **Slack Integration**:
    *   Use `@slac...

