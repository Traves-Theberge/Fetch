# Testing Guide

Fetch uses [Vitest](https://vitest.dev/) for all testing. Tests live in `fetch-app/tests/` and cover the TypeScript application layer.

## Running Tests

```bash
cd fetch-app

# Watch mode (interactive, re-runs on file change)
npm test

# Single run (CI-friendly)
npm run test:run

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npx vitest run --coverage
```

Coverage reports are generated in `fetch-app/coverage/` as text, JSON, and HTML.

## Test Structure

```
fetch-app/tests/
├── unit/                        # Fast, isolated, mocked deps
│   ├── command-parser.test.ts   # Slash-command routing (27 tests)
│   ├── harness-adapters.test.ts # Claude/Copilot/Gemini adapters (21 tests)
│   ├── identity.test.ts         # COLLAR.md + ALPHA.md loading (4 tests)
│   ├── intent.test.ts           # Intent classification (12 tests)
│   ├── security.test.ts         # Input validation, sanitization (41 tests)
│   ├── tool-registry.test.ts    # Tool registration + lookup (11 tests)
│   └── workspace-manager.test.ts # Workspace CRUD via Docker (7 tests)
├── integration/                 # Multi-module flows, mocked externals
│   ├── agent-loop.test.ts       # OpenAI mock → response loop (2 tests)
│   ├── conversation.test.ts     # Greeting/help/status routing (5 tests)
│   ├── harness.test.ts          # Full executor lifecycle (36 tests)
│   ├── task-execution.test.ts   # Tool-call flow → completion (1 test)
│   ├── task-flow.test.ts        # User message → harness → done (7 tests)
│   └── workspace.test.ts        # Workspace intent routing (5 tests)
└── helpers/                     # Shared test utilities
    ├── index.ts                 # Factory functions + re-exports
    ├── mock-harness.ts          # MockHarness with response queue
    └── mock-session.ts          # Typed session/message/workspace factories
```

**Total: 13 test files, 179 test cases**

## Writing Tests

### Conventions

- One `describe` block per module or feature
- Test names use `it('should ...')` format
- Setup/teardown in `beforeEach` / `afterEach`
- All external I/O is mocked (Docker, OpenAI, filesystem)

### Example Unit Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve a tool', () => {
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    });

    const tool = registry.get('test_tool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('test_tool');
  });

  it('should export tools in OpenAI format', () => {
    registry.register({
      name: 'my_tool',
      description: 'Does something',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    });

    const exported = registry.toOpenAITools();
    expect(exported[0].type).toBe('function');
    expect(exported[0].function.name).toBe('my_tool');
  });
});
```

### Example Integration Test

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHarness, createMockSession } from '../helpers';

describe('Task Flow', () => {
  let harness: MockHarness;

  beforeEach(() => {
    harness = new MockHarness();
    harness.reset();
  });

  it('should complete a task through the harness', async () => {
    harness.queueResponse({
      output: '## Summary\nFixed the auth bug in login.ts',
      exitCode: 0,
      filesModified: ['src/login.ts'],
    });

    const session = createMockSession({ activeTaskId: 'tsk_abc123' });
    const result = await harness.execute('Fix the auth bug', session);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Fixed the auth bug');
    expect(harness.calls).toHaveLength(1);
  });
});
```

## Mock System

### MockHarness

Replaces the real harness executor — no CLI processes spawned.

```typescript
import { MockHarness } from '../helpers';

const harness = new MockHarness();

// Pre-program responses (FIFO queue)
harness.queueResponse({
  output: 'Task completed successfully',
  exitCode: 0,
  filesModified: ['src/app.ts'],
});

// Execute and assert
const result = await harness.execute('do something', session);
expect(harness.calls[0].task).toBe('do something');

// Reset between tests
harness.reset();
```

| Method | Purpose |
|--------|---------|
| `queueResponse(r)` | Add a response to the FIFO queue |
| `queueError(msg)` | Add an error response |
| `execute(task, session)` | Run and consume next queued response |
| `calls` | Array of all recorded calls (task, session, timestamp) |
| `reset()` | Clear queue and call history |

### Session Factories

Typed factory functions with sane defaults and partial overrides:

```typescript
import { createMockSession, createMockMessage, createMockWorkspace } from '../helpers';

// Default session (autonomy=cautious, no active task)
const session = createMockSession();

// With overrides
const session = createMockSession({
  activeTaskId: 'tsk_123',
  preferences: { autonomyLevel: 'full', autoCommit: true },
});

// Mock message
const msg = createMockMessage({ role: 'user', content: 'fix the bug' });

// Mock workspace
const ws = createMockWorkspace({ name: 'my-project', path: '/workspace/my-project' });
```

### Mocking External Dependencies

```typescript
import { vi } from 'vitest';

// OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'response', role: 'assistant' } }],
        }),
      },
    },
  })),
}));

// Docker utils
vi.mock('../../src/utils/docker', () => ({
  dockerExec: vi.fn().mockResolvedValue({ stdout: '', exitCode: 0 }),
  isContainerRunning: vi.fn().mockResolvedValue(true),
  listContainers: vi.fn().mockResolvedValue(['fetch-kennel']),
}));
```

## Test Categories

| Category | Location | Speed | What to Mock | When to Use |
|----------|----------|-------|-------------|-------------|
| **Unit** | `tests/unit/` | < 1s each | Everything external | Pure logic, parsers, validators, classifiers |
| **Integration** | `tests/integration/` | 1-5s each | Docker, OpenAI, filesystem | Multi-module flows, harness pipelines |

### Unit Test Targets

Functions that are deterministic and self-contained:

- Intent classifier (`agent/intent.ts`)
- Command parser (`commands/parser.ts`)
- Input validator / sanitizer (`security/validator.ts`)
- Tool registry (`tools/registry.ts`)
- Harness adapters (`harness/claude.ts`, `copilot.ts`, `gemini.ts`)
- Identity loader (`session/identity.ts`)
- Response formatter (`agent/format.ts`)

### Integration Test Targets

Flows that cross module boundaries:

- Message → intent → mode → harness → response
- Task creation → harness execution → completion
- Workspace selection → repo map generation
- Conversation routing (greeting vs help vs status)

## Configuration

### vitest.config.ts

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
});
```

| Setting | Value | Reason |
|---------|-------|--------|
| `globals: true` | `describe/it/expect` available without import | Convenience (most files import explicitly anyway) |
| `environment: node` | Node.js runtime | Server-side application |
| `testTimeout: 30000` | 30s per test | Harness integration tests can be slow |
| Coverage exclude | `*.d.ts`, `index.ts` | Skip type defs and barrel re-exports |

## Coverage Map

### Covered (8 modules)

| Module | Test File | Tests | Strength |
|--------|-----------|------:|----------|
| Security (validator) | `security.test.ts` | 41 | 🟢 Strong |
| Harness (executor + adapters) | `harness.test.ts` + `harness-adapters.test.ts` | 57 | 🟢 Strong |
| Command parser | `command-parser.test.ts` | 27 | 🟢 Strong |
| Intent classifier | `intent.test.ts` | 12 | 🟢 Solid |
| Tool registry | `tool-registry.test.ts` | 11 | 🟢 Solid |
| Workspace manager | `workspace-manager.test.ts` + `workspace.test.ts` | 12 | 🟡 Moderate |
| Task flow | `task-flow.test.ts` + `task-execution.test.ts` | 8 | 🟡 Moderate |
| Identity | `identity.test.ts` | 4 | 🟡 Light |

### Not Covered (15 modules)

| Module | Risk | Why It Matters |
|--------|------|---------------|
| `agent/core.ts` | 🔴 High | Core orchestration loop — all messages pass through here |
| `handler/index.ts` | 🔴 High | Entry point for all WhatsApp messages |
| `session/store.ts` | 🔴 High | SQLite persistence — data loss if broken |
| `task/store.ts` | 🔴 High | Task persistence — in-flight tasks lost if broken |
| `bridge/client.ts` | 🔴 High | WhatsApp I/O layer |
| `conversation/` | 🟡 Medium | Mode detection, summarization, thread management |
| `instincts/` | 🟡 Medium | 12 auto-behavior modules |
| `proactive/` | 🟡 Medium | Scheduler, watchers, polling |
| `agent/format.ts` | 🟡 Medium | Response formatting for WhatsApp |
| `agent/prompts.ts` | 🟡 Medium | System prompt assembly |
| `commands/` (handlers) | 🟡 Medium | Individual command implementations |
| `modes/` | 🟡 Medium | Mode state machine |
| `skills/` | 🟡 Medium | Skill loading and activation |
| `transcription/` | 🟢 Low | Audio → text (uses external binary) |
| `vision/` | 🟢 Low | Image analysis (uses external API) |

## Adding New Tests

1. Create the file in the appropriate directory (`unit/` or `integration/`)
2. Name it `<module>.test.ts`
3. Import helpers from `../helpers`
4. Mock external dependencies at the top of the file
5. Run with `npm test` (watch mode) to iterate

```bash
# Run a single test file
npx vitest run tests/unit/my-new.test.ts

# Run tests matching a pattern
npx vitest run -t "should handle"

# Run with verbose output
npx vitest run --reporter=verbose
```
