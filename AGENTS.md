# Repository Guidelines

## Project Structure & Module Organization
- `fetch-app/`: Node.js/TypeScript “bridge” service (WhatsApp client + LLM orchestration). Source in `fetch-app/src/`, tests in `fetch-app/tests/`, build output in `fetch-app/dist/`.
- `manager/`: Go “manager” binary with `manager/main.go` and supporting code in `manager/internal/`.
- `kennel/`: Dockerized Ubuntu sandbox for agent execution and browser tooling.
- `config/`, `data/`, `docs/`, `scripts/`: runtime configuration, data files, documentation, and automation scripts.

## Build, Test, and Development Commands
- `bash setup-dev.sh`: verify Node/Go/Docker, install deps, build apps, and set up dev environment.
- `npm install`: install bridge dependencies (run inside `fetch-app/`).
- `npm run dev`: run bridge with `ts-node` (TypeScript, ESM).
- `npm run build`: compile TypeScript to `fetch-app/dist/`.
- `npm run lint`: run ESLint on TypeScript sources.
- `npm run test:run`: run all Vitest tests once; `npm run test:unit` / `npm run test:integration` for subsets.
- `go build -o fetch-manager .`: build the manager binary (run inside `manager/`).
- `bash manager/build.sh`: full manager build (multi-arch).
- `./deploy.sh` or `docker compose up -d`: build and start containers.

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation, ES module syntax, ESLint with `@typescript-eslint` (unused args allowed with `_` prefix). See `fetch-app/eslint.config.js`.
- Go: standard `gofmt` formatting and idiomatic Go naming.
- Paths and filenames are kebab-case or lower_snake_case; tests live under `fetch-app/tests/` and mirror source structure.

## Testing Guidelines
- Framework: Vitest (`fetch-app/vitest.config.ts`).
- Naming: `*.test.ts` under `fetch-app/tests/` (unit and integration subfolders).
- Run a single test file: `npx vitest run tests/unit/<file>.test.ts`.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (examples: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `build:`); scopes are optional.
- PRs should include: a concise description, rationale, and test evidence (commands run + results). Add screenshots for docs/UX changes when relevant.
- Release discipline: for every version tag/release, append human-readable release notes to the GitHub Release body (never leave it as compare-link only). Keep prior notes and append new sections for the new version.
