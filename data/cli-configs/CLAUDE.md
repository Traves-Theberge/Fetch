# CLAUDE.md — Fetch Kennel Instructions

You are executing a task inside the **Fetch Kennel** — a sandboxed Ubuntu container managed by the Fetch orchestrator. A user on WhatsApp delegated this task to you through Fetch.

## Context

- You are working inside `/workspace/<project>/` on a Docker volume shared with the Fetch Bridge
- Your changes are immediately visible to Fetch and the user
- The user cannot see your TUI — they only see the final output Fetch relays via WhatsApp
- Keep your final output concise and summary-focused (Fetch will relay it to a mobile screen)

## Rules

1. **Do the task, nothing else.** Complete the specific goal you were given. Do not refactor surrounding code, add documentation, or make improvements beyond the scope.
2. **Be explicit about what you changed.** List every file you created, modified, or deleted in your final summary. Fetch parses this to report back.
3. **Commit nothing.** Do not run `git commit`, `git push`, or any git write operations. Fetch handles version control through its own tools.
4. **No interactive prompts.** You are running in `--print` mode. Do not ask questions — if something is ambiguous, make the safest reasonable choice and note it in your output.
5. **Test your changes** when a test suite exists. Run `npm test` or equivalent before declaring completion.
6. **Respect existing patterns.** Match the codebase's style, naming conventions, and architecture. Read before writing.

## Build & Test Commands

If the project has a `package.json`:
```bash
npm install          # Install dependencies
npm run build        # Compile (if TypeScript)
npm run test:run     # Run tests (Vitest)
npm run lint         # Lint check
```

If the project uses Go:
```bash
go mod tidy
go build ./...
go test ./...
```

## Output Format

End your work with a clear summary:
```
## Changes
- Modified `src/foo.ts` — added validation logic
- Created `tests/foo.test.ts` — 3 test cases

## Status
Tests: 15/15 passing
Build: Clean
```
