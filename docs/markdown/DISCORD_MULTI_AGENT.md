# Discord Multi-Agent Setup

Run multiple Discord bots from a single Fetch bridge, each with its own personality, permissions, and (optionally) AI backend. Tag `@fetch` for code tasks, `@mary` for design review, `@scout` for research - all powered by the same infrastructure.

## Prerequisites

- Fetch bridge running in Discord mode (`BRIDGE_MODE=discord`)
- One Discord bot application per agent (free, takes 2 minutes each)
- A Discord server where you can add bots

## Step 1: Create Discord Bot Applications

Repeat this for each agent you want (e.g. "Fetch", "Mary", "Scout").

### 1a. Create the Application

1. Go to https://discord.com/developers/applications
2. Click **New Application** (top right)
3. Enter a name (e.g. `Mary`) and click **Create**
4. (Optional) Upload an avatar and set a description on the General Information page

### 1b. Create the Bot User

1. In the left sidebar, click **Bot**
2. Click **Reset Token** and copy the token - save it, you won't see it again
3. Under **Privileged Gateway Intents**, enable ALL THREE:
   - **Presence Intent** - optional but recommended
   - **Server Members Intent** - optional but recommended
   - **Message Content Intent** - **REQUIRED** (the bot reads message text)
4. Click **Save Changes**

### 1c. Generate the Invite Link

1. In the left sidebar, click **OAuth2**
2. Under **OAuth2 URL Generator**, check the `bot` scope
3. Under **Bot Permissions**, check:
   - Send Messages
   - Send Messages in Threads
   - Read Message History
   - Add Reactions
   - Attach Files
   - Use External Emojis
4. Copy the generated URL at the bottom
5. Open it in your browser and add the bot to your Discord server

### 1d. Get Your Discord IDs

You need snowflake IDs for the owner and channels:

1. In Discord, go to **Settings > Advanced > Developer Mode** and turn it ON
2. Right-click your username > **Copy User ID** - this is your `ownerId`
3. Right-click any channel > **Copy Channel ID** - this is for `channelIds`
4. Right-click other users > **Copy User ID** - these are for `trustedUserIds`

## Step 2: Configure DISCORD_AGENTS

Set the `DISCORD_AGENTS` environment variable as a JSON array. Each entry defines one bot agent.

### Minimal Example (Two Bots)

```env
BRIDGE_MODE=discord
DISCORD_AGENTS='[
  {
    "id": "fetch",
    "botToken": "MTIzNDU2Nzg5.abc.xyz-your-fetch-bot-token",
    "ownerId": "806444151422976035",
    "trustedUserIds": "164501800613969920",
    "channelIds": "1477116056286793768",
    "identity": {
      "name": "Fetch",
      "role": "Orchestrator & Senior Developer",
      "emoji": "🐕",
      "voiceTone": "Warm, eager, professional developer"
    }
  },
  {
    "id": "mary",
    "botToken": "OTg3NjU0MzIx.def.uvw-your-mary-bot-token",
    "ownerId": "806444151422976035",
    "trustedUserIds": "164501800613969920",
    "channelIds": "1477116056286793768",
    "identity": {
      "name": "Mary",
      "role": "Design Specialist & UX Researcher",
      "emoji": "🎨",
      "voiceTone": "Creative, detail-oriented, design-focused"
    }
  }
]'
```

### Full Agent Config Reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | Yes | - | Unique slug (lowercase, no spaces). Used in session namespacing. |
| `botToken` | Yes | - | Discord bot token from Developer Portal. |
| `ownerId` | Yes | - | Your Discord user snowflake ID. |
| `trustedUserIds` | No | `""` | Comma-separated snowflakes of users allowed to talk to this bot. |
| `channelIds` | No | `""` | Comma-separated channel snowflakes. Empty = all DMs + any channel. |
| `identityDir` | No | Global `IDENTITY_DIR` | Path to a directory containing a custom `COLLAR.md` for this agent. |
| `identity` | No | Default Fetch identity | Inline identity overrides (see below). |
| `identity.name` | No | `"Fetch"` | Display name used in prompts. |
| `identity.role` | No | `"Orchestrator & Senior Developer"` | Role description in system prompt. |
| `identity.emoji` | No | `"🤖"` | Signature emoji. |
| `identity.voiceTone` | No | Default tone | Voice/personality description. |
| `agentModel` | No | `AGENT_MODEL` env | Override the LLM model for this agent. |
| `platform` | No | `"Discord"` | Platform label in system prompt. |

### Identity: Inline vs COLLAR.md

You can define personality two ways:

**Inline** (in the JSON config): Quick, no extra files. Use the `identity` object.

**COLLAR.md file** (via `identityDir`): Full control over directives, behavioral traits, and communication style. Create a directory with a `COLLAR.md` file:

```
/app/data/identities/mary/COLLAR.md
```

```markdown
## Core Identity
- **Name:** Mary
- **Role:** Design Specialist & UX Researcher
- **Voice:** Creative, detail-oriented, design-focused
- **Emoji:** 🎨

## Directives
### Primary Directives
- Always consider accessibility in design suggestions
- Prefer modern, clean design patterns
- Reference established design systems (Material, Tailwind, etc.)

### Operational Guidelines
- Provide visual examples when discussing layout
- Suggest color palettes with hex codes
- Consider mobile-first design

### Behavioral Traits
- Use design terminology naturally
- Reference design principles (contrast, hierarchy, spacing)
- Be encouraging about creative experimentation
```

Then reference it in config:
```json
{
  "id": "mary",
  "botToken": "...",
  "ownerId": "...",
  "identityDir": "/app/data/identities/mary"
}
```

**Priority**: Inline `identity` overrides always win over COLLAR.md values.

## Step 3: Remove Single-Bot Variables

When using `DISCORD_AGENTS`, you no longer need the single-bot env vars. Remove or leave unset:

```env
# These are IGNORED when DISCORD_AGENTS is set:
# DISCORD_BOT_TOKEN=...
# DISCORD_OWNER_ID=...
# DISCORD_TRUSTED_USER_IDS=...
# DISCORD_CHANNEL_IDS=...
```

## Step 4: Start the Bridge

```bash
docker compose up --build -d
# Then trigger the start:
curl -X POST http://localhost:8765/api/discord/start
```

You should see logs like:

```
🐕 Fetch is Ready! (Multi-Agent Mode)
  Agent "fetch" logged in as Fetch#1234
  Agent "mary" logged in as Mary#5678
```

## How It Works

### Session Isolation

Each bot maintains **separate conversation history** per user. When you talk to `@fetch`, that conversation is independent from your conversation with `@mary`. Sessions are namespaced as `discord:<agentId>:<userSnowflake>`.

### Shared Infrastructure

All bots share:
- The same **handler pipeline** (session store, task system, tool registry)
- The same **kennel container** (CLI harnesses: Copilot, Claude, Gemini, etc.)
- The same **workspace volume** (projects at `/workspace`)
- The same **status API** on port 8765

### Security

Each bot has its own security gate:
- `ownerId`: Who owns this bot (required)
- `trustedUserIds`: Who else can talk to it
- `channelIds`: Which channels it responds in

A user must be trusted by a specific bot to interact with it. Being trusted by `@fetch` does not grant access to `@mary`.

## Example: Three-Agent Team

```env
DISCORD_AGENTS='[
  {
    "id": "fetch",
    "botToken": "TOKEN_1",
    "ownerId": "YOUR_ID",
    "trustedUserIds": "FRIEND_ID_1,FRIEND_ID_2",
    "channelIds": "GENERAL_CHANNEL,DEV_CHANNEL",
    "identity": {
      "name": "Fetch",
      "role": "Lead Developer & Task Orchestrator",
      "emoji": "🐕",
      "voiceTone": "Warm, professional, action-oriented"
    }
  },
  {
    "id": "mary",
    "botToken": "TOKEN_2",
    "ownerId": "YOUR_ID",
    "channelIds": "DESIGN_CHANNEL,DEV_CHANNEL",
    "identity": {
      "name": "Mary",
      "role": "Design Specialist & Frontend Expert",
      "emoji": "🎨",
      "voiceTone": "Creative, detail-oriented, encouraging"
    }
  },
  {
    "id": "scout",
    "botToken": "TOKEN_3",
    "ownerId": "YOUR_ID",
    "channelIds": "RESEARCH_CHANNEL,DEV_CHANNEL",
    "identity": {
      "name": "Scout",
      "role": "Research Analyst & Documentation Writer",
      "emoji": "🔍",
      "voiceTone": "Thorough, analytical, informative"
    }
  }
]'
```

## Troubleshooting

### Bot doesn't respond

- Check that `Message Content Intent` is enabled in the Discord Developer Portal
- Verify the user is in `trustedUserIds` (or is the `ownerId`)
- Verify the channel is in `channelIds` (or leave empty for all channels)
- Check logs: `docker compose logs fetch-bridge --tail 50`

### "Invalid token" error

- Tokens are per-bot. Make sure each entry has its own unique `botToken`
- If you regenerated a token, update the config

### Bot shows offline

- Each bot must be invited to the server separately (Step 1c)
- Check that the bot token hasn't expired

### "DISCORD_AGENTS is not valid JSON"

- Make sure the JSON is properly escaped in your `.env` file
- Use single quotes around the entire value in `.env`
- Validate your JSON at https://jsonlint.com

### Fallback to single-bot mode

If `DISCORD_AGENTS` is unset or empty, the bridge falls back to the original single-bot mode using `DISCORD_BOT_TOKEN` / `DISCORD_OWNER_ID` / etc. No changes needed to existing setups.
