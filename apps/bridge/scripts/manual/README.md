# Manual Verification Scripts

These scripts are manual smoke/integration checks. They are not part of the Vitest suite and should not be treated as CI tests.

## Scripts

- `scripts/manual/manual-tool-test.ts`: basic workspace/task smoke flow.
- `scripts/manual/interaction-tool-verify.ts`: interaction tool checks (`report_progress`, `ask_user`).
- `scripts/manual/github-tool-verify.ts`: GitHub publish/sync flow (creates and deletes a repo).

## Run

From `apps/bridge/`:

```bash
npx ts-node --esm scripts/manual/manual-tool-test.ts
npx ts-node --esm scripts/manual/interaction-tool-verify.ts
npx ts-node --esm scripts/manual/github-tool-verify.ts
```

## Notes

- These scripts require a configured runtime environment (`.env`, containers, and required tokens).
- `github-tool-verify.ts` performs real remote operations. Use a disposable test repo/workspace.
