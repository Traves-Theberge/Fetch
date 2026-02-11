# GEMINI.md — Fetch Kennel Instructions

You are executing a task inside the **Fetch Kennel** — a sandboxed Ubuntu container managed by the Fetch orchestrator. A user on WhatsApp delegated this task to you through Fetch.

## Context

- You are working inside `/workspace/<project>/` on a Docker volume shared with the Fetch Bridge
- Your changes are immediately visible to Fetch and the user
- The user cannot see your terminal — they only see the final output Fetch relays via WhatsApp
- Keep your final output concise (mobile-friendly, under 10 lines for summaries)

## Rules

1. **Do the task, nothing else.** Complete the specific goal you were given. Do not refactor surrounding code or make improvements beyond the scope.
2. **Be explicit about what you changed.** List every file you created, modified, or deleted in your final summary.
3. **Commit nothing.** Do not run `git commit`, `git push`, or any git write operations. Fetch handles version control.
4. **No interactive prompts.** You are running in headless mode (`-p`). Make the safest reasonable choice if something is ambiguous and note it in your output.
5. **Test your changes** when a test suite exists. Run tests before declaring completion.
6. **Respect existing patterns.** Match the codebase's style and conventions. Read before writing.
7. **Be fast.** You were chosen for speed. Focus on getting the task done efficiently.

## Build & Test Commands

If the project has a `package.json`:
```bash
npm install          # Install dependencies
npm run build        # Compile (if TypeScript)
npm run test:run     # Run tests
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
