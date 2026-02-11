# State Management

> Fetch persists state across three layers: **Session** (Message History), **Workspace** (Git/File Context), and **Task** (Active Jobs). All state is backed by SQLite (WAL mode) for crash-safety and zero-config deployment.

```mermaid
erDiagram
    SESSIONS ||--|{ MESSAGES : contains
    SESSIONS {
        string id PK
        string user_id
        string threads
        string metadata
        string created_at
    }
    MESSAGES {
        string id PK
        string session_id FK
        string role
        string content
        string tool_calls
        string tool_call_id
        string created_at
    }
```

## Session Architecture

The `SessionManager` orchestrates all state changes. It wraps SQLite transactions to ensure that message history, tool outputs, and metadata updates are atomic.

### Schema (Simplified)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  threads TEXT, -- JSON array of thread IDs
  metadata TEXT, -- JSON: complexity, projectType, autonomyLevel
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- user, assistant, tool
  content TEXT NOT NULL,
  tool_calls TEXT, -- JSON: [{id, function: {name, arguments}}]
  tool_call_id TEXT, -- For role='tool'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### State Flow

```mermaid
stateDiagram-v2
    [*] --> RESTING
    RESTING --> ALERT: Wake Word / Message
    ALERT --> WORKING: Task Start
    WORKING --> ALERT: Complete / Stop
    
    WORKING --> WAITING: tool ask_user
    WAITING --> WORKING: User Input
    
    ALERT --> GUARDING: Dangerous Action
    GUARDING --> WORKING: Approved
    GUARDING --> ALERT: Denied

    ALERT --> RESTING: Timeout
    GUARDING --> ALERT: Timeout
```

The system moves between 5 core states managed by `TaskManager`:

1. **RESTING**: Idle, waiting for wake word (`@fetch`) or message.
2. **ALERT**: Security checks passed, determining intent.
3. **GUARDING**: Dangerous action (e.g., `git push --force`) detected; waiting for user approval.
4. **WORKING**: LLM or Harness is executing; showing spinner.
5. **WAITING**: Tool requested user input (`ask_user`); blocked until reply.

## Workspace State

Fetch is "stateless" regarding file edits — it reads the current state of the disk and git index on every turn. This prevents "Context Amnesia" where the agent thinks a file exists but it was deleted externally.

Each tool call (`workspace_select`, `git_commit`) triggers a re-read of the repo map, ensuring the LLM always sees the ground truth.
