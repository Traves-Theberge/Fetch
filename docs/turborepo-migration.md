# Turborepo Migration Plan for Fetch

## Table of Contents

- [Executive Summary](#executive-summary)
- [Current Architecture](#current-architecture)
- [Why Turborepo](#why-turborepo)
- [Proposed Monorepo Structure](#proposed-monorepo-structure)
- [Why Kennel Stays Top-Level](#why-kennel-stays-top-level)
- [Turborepo + Docker Compose Best Practices](#turborepo--docker-compose-best-practices)
- [turbo.json Configuration](#turbojson-configuration)
- [Root package.json Workspace Manifest](#root-packagejson-workspace-manifest)
- [Package Configurations](#package-configurations)
- [Docker Adaptation](#docker-adaptation)
- [CI/CD Updates](#cicd-updates)
- [Migration Phases](#migration-phases)
- [Day-to-Day Developer Experience](#day-to-day-developer-experience)
- [Trade-offs and Honest Assessment](#trade-offs-and-honest-assessment)
- [Reference Links](#reference-links)

---

## Executive Summary

Fetch is a polyglot project with three independent build systems (TypeScript/npm, Go modules, Docker) and no shared task orchestration. This document proposes migrating to a Turborepo monorepo to gain build caching, parallel task execution, and a workspace package system — while preserving the existing Docker Compose deployment model.

The migration is designed to be **incremental and reversible**. Phase 1 adds Turborepo scaffolding with zero behavior change. Later phases extract shared packages and optimize CI.

---

## Current Architecture

```
Fetch/                          # No root package.json, no workspace config
├── fetch-app/                  # Node.js/TypeScript bridge (npm, ~24k LoC)
│   ├── package.json            # "fetch-bridge", ES modules, TypeScript 5.9
│   ├── tsconfig.json           # Standalone config, no shared base
│   ├── vitest.config.ts        # Vitest with v8 coverage
│   ├── Dockerfile              # Multi-stage: build TS, install Chromium + whisper.cpp
│   ├── src/                    # 20+ modules: bridge, agent, harness, skills, tools...
│   └── tests/                  # unit/ + integration/ + helpers/
│
├── manager/                    # Go TUI manager binary (~6.7k LoC)
│   ├── go.mod                  # Go 1.24, Bubble Tea framework
│   ├── main.go                 # Single-file TUI (splash, menu, config, logs...)
│   └── build.sh                # Multi-arch build script (amd64 + arm64)
│
├── kennel/                     # AI CLI execution sandbox (Docker-only)
│   └── Dockerfile              # Ubuntu + node + git + 5 AI CLIs + Playwright
│
├── scripts/                    # install.sh, fetch-cli.sh, prereqs, harness management
├── config/                     # Runtime config (searxng settings)
├── data/                       # Persistent runtime data (WhatsApp session, SQLite)
├── workspace/                  # Shared volume for code operations
├── docs/                       # Documentation
├── .github/workflows/          # 3 workflows: release, manager-build, install-smoke
├── docker-compose.yml          # 3 services: fetch-bridge, fetch-kennel, searxng
├── VERSION                     # 0.0.96
└── .env                        # Runtime secrets (symlinked)
```

### What Each Component Does

**fetch-app (the Bridge)** — The brain. A TypeScript application that connects to WhatsApp or Discord, receives messages, orchestrates an LLM agent pipeline, dispatches tool calls, manages sessions in SQLite, and controls the Kennel container via the Docker socket. Runs inside the `fetch-bridge` Docker container.

**manager (the TUI)** — A Go binary providing a terminal UI for setup, configuration, log viewing, and status monitoring. Connects to the bridge's HTTP status API on port 8765. Built for linux/amd64 and linux/arm64, distributed as GitHub Release artifacts.

**kennel (the Sandbox)** — A Docker image containing AI CLI tools (GitHub Copilot, Claude Code, Gemini CLI, OpenCode, Codex) plus git, Python, Playwright, and a browser agent. The bridge `exec`s commands into this container to run AI-assisted code operations in an isolated environment. It has no application code of its own — it's a toolbox image.

**searxng** — A third-party Docker image (`searxng/searxng:latest`) providing private meta-search. No build step, just configuration files mounted from `config/searxng/`.

### Current Build Commands

| Component | Build | Test | Dev |
|-----------|-------|------|-----|
| fetch-app | `cd fetch-app && npm run build` (tsc) | `npm run test:run` (vitest) | `npm run dev` (ts-node) |
| manager | `cd manager && bash build.sh` (go build, multi-arch) | None | `go run .` |
| kennel | `docker build ./kennel` | None | N/A |
| Full stack | `docker compose build && docker compose up` | N/A | N/A |

### Problems with Current Setup

1. **No caching** — Every `npm run build` recompiles all TypeScript even if nothing changed. Every CI run starts from scratch.
2. **No shared configuration** — `tsconfig.json` is standalone. Adding a second TS package means duplicating config.
3. **No workspace protocol** — No way to create internal `@fetch/*` packages that can be imported across the project.
4. **No unified task runner** — Building the full project requires knowing which directories to `cd` into and which commands to run in which order.
5. **No dependency graph awareness** — Nothing understands that the bridge depends on types that might live in a shared package, or that tests depend on build output.

---

## Why Turborepo

Turborepo is a build system for JavaScript/TypeScript monorepos, written in Rust. It provides:

### Build Caching

Turborepo hashes task inputs (source files, dependencies, environment variables, config) and stores outputs. If nothing changed, the task is skipped entirely and outputs are restored from cache.

For Fetch, this means:
- `tsc` compilation of the bridge (~24k LoC) is skipped when source files haven't changed
- `vitest` test runs can be cached when source and test files are unchanged
- CI runs that only touch the manager don't rebuild the bridge at all

### Task Graph Execution

Turborepo builds a directed acyclic graph of tasks across all packages and executes them with maximum parallelism while respecting dependency ordering.

```
@fetch/types#build ──→ @fetch/bridge#build ──→ @fetch/bridge#test
                                              ──→ @fetch/bridge#lint
@fetch/manager#build (parallel, no JS dependencies)
```

### Workspace Packages

npm workspaces (orchestrated by Turborepo) allow internal packages like `@fetch/types` or `@fetch/typescript-config` that are linked locally without publishing to npm. Import them like any npm package:

```typescript
import { BridgeConfig } from "@fetch/types";
```

### Docker Integration

`turbo prune --scope=@fetch/bridge --docker` produces a minimal subset of the monorepo containing only the packages needed for a specific app. This enables lean Docker images with optimal layer caching.

### Remote Caching

Build artifacts can be shared across developers and CI runners via Vercel's remote cache (or a self-hosted server). A CI run on branch A populates the cache; a CI run on branch B with overlapping unchanged packages gets instant cache hits.

---

## Proposed Monorepo Structure

```
Fetch/
├── apps/
│   ├── bridge/                     # fetch-app → renamed and moved
│   │   ├── package.json            # name: "@fetch/bridge"
│   │   ├── tsconfig.json           # extends @fetch/typescript-config
│   │   ├── vitest.config.ts
│   │   ├── Dockerfile              # updated for turbo prune
│   │   ├── src/
│   │   │   ├── index.ts            # entry point
│   │   │   ├── bridge/             # WhatsApp + Discord clients
│   │   │   ├── agent/              # LLM orchestration
│   │   │   ├── harness/            # CLI sandbox execution
│   │   │   ├── skills/             # 8 builtin skills
│   │   │   ├── tools/              # tool registry + execution
│   │   │   ├── session/            # SQLite persistence
│   │   │   ├── api/                # status server
│   │   │   └── ...                 # config, security, vision, etc.
│   │   └── tests/
│   │       ├── unit/
│   │       ├── integration/
│   │       └── helpers/
│   │
│   └── manager/                    # Go TUI, shim package.json
│       ├── package.json            # name: "@fetch/manager"
│       ├── go.mod
│       ├── go.sum
│       ├── main.go
│       └── build.sh
│
├── packages/
│   ├── typescript-config/          # NEW — shared tsconfig base
│   │   ├── package.json            # name: "@fetch/typescript-config"
│   │   └── base.json
│   │
│   └── types/                      # NEW — shared TypeScript types
│       ├── package.json            # name: "@fetch/types"
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
│
├── kennel/                         # STAYS HERE — see explanation below
│   └── Dockerfile
│
├── config/                         # Runtime config (searxng)
├── data/                           # Persistent data (gitignored)
├── workspace/                      # Shared Docker volume
├── scripts/                        # Install + deployment scripts
├── docs/                           # Documentation
├── .github/workflows/              # CI/CD (updated for turbo)
│
├── package.json                    # NEW — root workspace manifest
├── turbo.json                      # NEW — task pipeline config
├── .npmrc                          # NEW — workspace settings
├── docker-compose.yml              # UPDATED — new build contexts
├── .dockerignore                   # UPDATED — monorepo-aware
├── .gitignore                      # UPDATED
├── VERSION
└── .env
```

---

## Why Kennel Stays Top-Level

Kennel is **not** moved into `apps/` and does **not** get a `package.json`. This is a deliberate architectural decision, not an oversight. Here's why:

### 1. Kennel Has No Application Code

Kennel is a **Docker image definition** — a `Dockerfile` that installs system packages, AI CLI tools, and runtime configuration. It doesn't contain any JavaScript, TypeScript, or Go source code. There is nothing for Turborepo to build, test, lint, or cache. Its entire build artifact is a Docker image, which lives in the Docker layer cache, not the Turborepo cache.

Compare to the other components:
- `apps/bridge` has TypeScript source → `tsc` → `dist/` (Turborepo manages this)
- `apps/manager` has Go source → `go build` → binary (Turborepo can orchestrate this)
- `kennel/` has a Dockerfile → `docker build` → Docker image (Docker manages this)

### 2. Turborepo Cannot Cache Docker Builds

Turborepo caches task outputs as files on the filesystem (in `.turbo/cache/`). Docker images are stored in Docker's own layer cache and image store. There is no meaningful way for Turborepo to:
- Hash Docker build inputs correctly (base images change, `apt-get install` results vary)
- Store Docker images in its cache format
- Restore Docker images from its cache

Wrapping `docker build` in a Turborepo task via a shim `package.json` would add complexity without providing caching or dependency graph benefits.

### 3. Kennel's Build Dependencies Are External

Kennel's Dockerfile pulls from:
- `node:20-slim` base image (external registry)
- `apt-get` packages (Ubuntu repositories)
- `npm install -g` for 5 AI CLI tools (npm registry)
- `gh extension install` for GitHub Copilot (GitHub)
- Playwright browser binaries (Microsoft CDN)

None of these are workspace packages. Kennel has zero dependency on `@fetch/bridge`, `@fetch/types`, or any other internal package. Adding it to the Turborepo workspace graph would create a node with no edges — pure overhead.

### 4. Kennel's Lifecycle Is Different

Kennel is rebuilt rarely — only when AI CLI tools need updating or system dependencies change. The bridge is rebuilt on every code change. Coupling them in the same task graph would either:
- Force unnecessary Kennel rebuilds when bridge code changes (if linked via `dependsOn`)
- Add a confusing no-op node to `turbo run build` output (if not linked)

Kennel's build is correctly managed by `docker compose build fetch-kennel`, which only rebuilds when the Dockerfile or its context changes. Docker's layer caching already handles this efficiently.

### 5. It's a Runtime Dependency, Not a Build Dependency

The bridge doesn't import code from Kennel. It connects to Kennel at runtime via the Docker socket (`dockerode` library), executing commands inside the running container. This is an infrastructure relationship, not a code dependency. Turborepo models code dependency graphs; Docker Compose models infrastructure dependency graphs. Each tool handles the relationship it's designed for:

```yaml
# docker-compose.yml — infrastructure dependency
fetch-bridge:
  depends_on:
    - fetch-kennel    # Kennel must be running, not built by Turbo
```

```json
// turbo.json — code dependency
"build": {
  "dependsOn": ["^build"]  // @fetch/types must build before @fetch/bridge
}
```

### 6. Convention in the Ecosystem

Major Turborepo monorepos (Vercel's own repos, t3-oss, Cal.com) follow the same pattern: infrastructure-only Docker images, Terraform configs, Helm charts, and other non-JS artifacts live outside `apps/` and `packages/`. The `apps/` directory is for deployable applications with source code. The `packages/` directory is for shared libraries. Infrastructure definitions get their own top-level directories.

### Summary

| Question | Answer |
|----------|--------|
| Does Kennel have JS/TS/Go source code? | No |
| Can Turborepo cache its build output? | No (Docker images aren't files) |
| Does it depend on workspace packages? | No |
| Does any workspace package depend on it? | No (runtime-only relationship) |
| Would a shim package.json add value? | No (all cost, no benefit) |
| What manages its build correctly? | Docker + Docker Compose |

---

## Turborepo + Docker Compose Best Practices

Running Turborepo inside a Docker Compose architecture requires careful coordination between two systems that each have their own caching, dependency resolution, and build orchestration. Here are the patterns and pitfalls.

### Principle 1: Turborepo Builds Code, Docker Compose Builds Infrastructure

Draw a clear line:

```
Turborepo handles:                    Docker Compose handles:
├── TypeScript compilation            ├── Container image assembly
├── Test execution                    ├── Service dependencies (depends_on)
├── Linting                           ├── Volume mounts
├── Internal package resolution       ├── Network configuration
└── Build caching + parallelism       └── Runtime orchestration
```

In practice, this means the Dockerfile for the bridge runs `turbo prune` and `turbo run build` inside the Docker build, but Docker Compose orchestrates when and how that Dockerfile gets built.

### Principle 2: Use `turbo prune` for Lean Docker Builds

In a monorepo, a naive `COPY . .` in a Dockerfile copies every package into the image, including unrelated apps and packages. `turbo prune` solves this by producing a minimal subset.

The `--docker` flag splits output into two directories for optimal Docker layer caching:

```
out/
├── json/           # Only package.json + lockfile (dependency layer)
└── full/           # Full source code (build layer)
```

This separation means dependency installation (`npm install`) is cached as a Docker layer and only invalidated when `package.json` or `package-lock.json` changes — not when source code changes.

### Principle 3: Multi-Stage Dockerfile Pattern

```dockerfile
# Stage 1: Prune the monorepo
FROM node:20-slim AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @fetch/bridge --docker

# Stage 2: Install dependencies (cached layer)
FROM node:20-slim AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm install --frozen-lockfile

# Stage 3: Build application
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=@fetch/bridge

# Stage 4: Production runtime
FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app/apps/bridge/dist ./dist
COPY --from=builder /app/apps/bridge/package.json ./
COPY --from=builder /app/node_modules ./node_modules
# ... install runtime system deps (Chromium, whisper.cpp, Docker CLI)
CMD ["node", "dist/index.js"]
```

**Why four stages?**

1. **Pruner** — Full monorepo context, generates minimal subset. This layer is invalidated whenever any file changes, but it's cheap (just file copying + prune).
2. **Installer** — Only `package.json` files and lockfile. `npm install` is expensive but this layer is only invalidated when dependencies change, not when source code changes.
3. **Builder** — Source code + installed deps. `turbo run build` compiles TypeScript. Invalidated on source changes but deps are already cached.
4. **Runner** — Production image with only compiled output and runtime dependencies. No TypeScript, no dev dependencies, no build tools.

### Principle 4: Docker Build Context Must Be the Monorepo Root

Because `turbo prune` needs access to the full workspace structure, the Docker build context must be the repository root, not the individual app directory.

```yaml
# docker-compose.yml
services:
  fetch-bridge:
    build:
      context: .                        # Root, not ./apps/bridge
      dockerfile: apps/bridge/Dockerfile
```

This is different from the current setup where `context: .` with `dockerfile: fetch-app/Dockerfile` happens to work because `fetch-app/` is the only JS directory. In the monorepo layout, the Dockerfile explicitly needs root context to access `packages/`, `turbo.json`, and the root `package.json`.

### Principle 5: .dockerignore Must Be Monorepo-Aware

A proper `.dockerignore` prevents sending unnecessary files to the Docker daemon:

```dockerignore
# Dependencies (reinstalled inside Docker)
**/node_modules

# Build outputs (rebuilt inside Docker)
**/dist

# Turborepo cache (never needed in Docker)
.turbo

# Git history (not needed for build)
.git

# Runtime data (not part of build)
data/
workspace/

# Go build artifacts (manager is built separately)
apps/manager/fetch-manager-*

# IDE and OS files
.vscode
.idea
.DS_Store

# Environment files (injected at runtime, not build time)
.env
.env.*
!.env.example
```

### Principle 6: Non-JS Services Stay Outside Turborepo's Scope

The `docker-compose.yml` manages three services. Only one (`fetch-bridge`) is built by Turborepo. The others are managed purely by Docker:

```yaml
services:
  fetch-bridge:
    build:
      context: .
      dockerfile: apps/bridge/Dockerfile     # Turborepo builds this
    depends_on:
      - fetch-kennel

  fetch-kennel:
    build:
      context: ./kennel                       # Pure Docker build
      dockerfile: Dockerfile

  searxng:
    image: searxng/searxng:latest             # Pre-built image, no build step
```

### Principle 7: Environment Variables Need Declaration

Turborepo uses environment variables as part of its cache hash. If an env var changes the build output but isn't declared in `turbo.json`, you'll get stale cache hits. Declare all build-affecting env vars:

```json
{
  "globalEnv": ["NODE_ENV"],
  "globalDependencies": [".env", "VERSION"],
  "tasks": {
    "build": {
      "env": ["FETCH_*"]
    }
  }
}
```

For Docker Compose, env vars are injected at **runtime** via `env_file` and `environment` directives. These do not affect Turborepo's build cache because Docker builds happen in isolated contexts.

### Principle 8: Don't Run `turbo` as the Docker Entrypoint

Turborepo is a **build-time** tool. The Docker container's entrypoint should be the compiled application, not the build system:

```dockerfile
# Correct — run the compiled app
CMD ["node", "dist/index.js"]

# Wrong — running turbo at container start adds
# unnecessary overhead and complexity
CMD ["npx", "turbo", "run", "start", "--filter=@fetch/bridge"]
```

### Principle 9: Cache Mounts for Faster Docker Builds (Advanced)

Docker BuildKit supports cache mounts that persist across builds. Combine with Turborepo's local cache:

```dockerfile
RUN --mount=type=cache,target=/app/.turbo \
    npx turbo run build --filter=@fetch/bridge
```

This keeps Turborepo's cache across Docker builds, so rebuilds after minor source changes are near-instant even inside Docker.

### Principle 10: Go Services Get a Shim, Not a Full Integration

The Go manager participates in the Turborepo task graph via a minimal `package.json` that delegates to shell scripts:

```json
{
  "name": "@fetch/manager",
  "version": "0.0.96",
  "private": true,
  "scripts": {
    "build": "bash build.sh",
    "clean": "rm -f fetch-manager-*"
  }
}
```

This is the correct Turborepo pattern for non-JS packages. Turborepo discovers the package via its `package.json`, runs the `build` script, and caches the binary output specified in `turbo.json`:

```json
{
  "tasks": {
    "build": {
      "outputs": ["dist/**", "fetch-manager-*"]
    }
  }
}
```

The Go module system (`go.mod`, `go.sum`) continues to manage Go dependencies independently. Turborepo doesn't replace `go mod` — it just orchestrates when `go build` runs and caches the result.

Caveat: Turborepo's cache hash is based on file content. Go's build cache (`GOCACHE`) is separate. For the manager, Turborepo caching provides value in CI (skip the Go build entirely if no `.go` files changed) but less value locally (Go's own build cache is already fast).

---

## turbo.json Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env", "VERSION"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "fetch-manager-*"],
      "inputs": [
        "src/**",
        "package.json",
        "tsconfig.json",
        "*.go",
        "go.mod",
        "go.sum",
        "build.sh"
      ]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": false
    },
    "test:run": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**", "tests/**", "vitest.config.ts"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Configuration Explained

**`globalDependencies`** — Files that affect all task hashes. When `.env` or `VERSION` changes, every cached task is invalidated. This ensures version bumps trigger full rebuilds.

**`"dependsOn": ["^build"]`** — The `^` means "run this task's dependencies' build tasks first." If `@fetch/bridge` depends on `@fetch/types`, then `@fetch/types#build` runs before `@fetch/bridge#build`.

**`"outputs": ["dist/**"]`** — Tells Turborepo which files to cache. Without this, caching is disabled for the task. On cache hit, these files are restored from cache instead of running the task.

**`"inputs"`** — Files that affect the task hash. Defaults to all Git-tracked files in the package. Narrowing this improves cache hit rates. For example, changing `README.md` won't invalidate the `build` cache because `README.md` isn't in the `inputs` list.

**`"cache": false`** — Disables caching for tasks with side effects. `test` in watch mode (`vitest`) should never be cached. `test:run` (single execution) can be cached because it's deterministic.

**`"persistent": true`** — Marks long-running tasks (like `dev` servers) that don't exit. Turborepo won't wait for them to complete before considering the pipeline "done."

---

## Root package.json Workspace Manifest

```json
{
  "name": "fetch",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test:run",
    "lint": "turbo run lint",
    "dev": "turbo run dev --parallel",
    "clean": "turbo run clean",
    "docker:build": "docker compose build",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "deploy": "bash deploy.sh"
  },
  "devDependencies": {
    "turbo": "^2"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "npm@10.8.0"
}
```

### Notes

- **`"private": true`** — Prevents accidentally publishing the root to npm.
- **`"workspaces"`** — npm's native workspace feature. All directories matching `apps/*` and `packages/*` that contain a `package.json` are automatically linked.
- **`"packageManager"`** — Declares the expected package manager version. Corepack (bundled with Node.js 20+) enforces this.
- **Docker scripts** — Convenience wrappers. These don't go through Turborepo because Docker Compose has its own orchestration.

---

## Package Configurations

### apps/bridge/package.json

```json
{
  "name": "@fetch/bridge",
  "version": "0.0.96",
  "description": "Fetch - WhatsApp/Discord AI Assistant Bridge",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node --esm src/index.ts",
    "lint": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@fetch/types": "*",
    "@mozilla/readability": "^0.6.0",
    "better-sqlite3": "^12.6.2",
    "chokidar": "^5.0.0",
    "discord.js": "^14.25.1",
    "dockerode": "^4.0.9",
    "dotenv": "^17.2.3",
    "gray-matter": "^4.0.3",
    "jsdom": "^28.0.0",
    "nanoid": "^5.1.6",
    "openai": "^6.18.0",
    "strip-ansi": "^7.1.2",
    "turndown": "^7.2.2",
    "whatsapp-web.js": "^1.34.6",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@fetch/typescript-config": "*",
    "@types/better-sqlite3": "^7.6.12",
    "@types/dockerode": "^4.0.1",
    "@types/jsdom": "^27.0.0",
    "@types/node": "^25.2.1",
    "@types/turndown": "^5.0.6",
    "@vitest/coverage-v8": "^4.0.18",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "overrides": {
    "minimatch": "10.2.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

The `"*"` version for workspace dependencies (`@fetch/types`, `@fetch/typescript-config`) means "use whatever version is in the workspace." npm resolves these to symlinks, not registry downloads.

### apps/manager/package.json

```json
{
  "name": "@fetch/manager",
  "version": "0.0.96",
  "private": true,
  "scripts": {
    "build": "bash build.sh",
    "clean": "rm -f fetch-manager-*"
  }
}
```

Minimal shim. No dependencies. Turborepo discovers this package and runs `bash build.sh` when `turbo run build` is invoked. The Go toolchain is required on the host (or in CI) but is not managed by npm.

### packages/typescript-config/package.json

```json
{
  "name": "@fetch/typescript-config",
  "version": "0.0.1",
  "private": true,
  "files": ["base.json"]
}
```

### packages/typescript-config/base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### apps/bridge/tsconfig.json (updated)

```json
{
  "extends": "@fetch/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### packages/types/package.json

```json
{
  "name": "@fetch/types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@fetch/typescript-config": "*",
    "typescript": "^5.9.3"
  }
}
```

The types package starts empty or with a few shared interfaces. Types are migrated into it incrementally as the need arises — not in a big-bang extraction.

---

## Docker Adaptation

### Updated docker-compose.yml

```yaml
services:
  fetch-bridge:
    build:
      context: .                            # Monorepo root (needed for turbo prune)
      dockerfile: apps/bridge/Dockerfile    # Updated path
    container_name: fetch-bridge
    restart: unless-stopped
    # ... rest unchanged (healthcheck, env_file, ports, volumes, etc.)
    depends_on:
      - fetch-kennel

  fetch-kennel:
    build:
      context: ./kennel                     # Unchanged — standalone Docker build
      dockerfile: Dockerfile
    # ... rest unchanged

  searxng:
    image: searxng/searxng:latest           # Unchanged — no build step
    # ... rest unchanged
```

### Updated apps/bridge/Dockerfile

```dockerfile
# ── Stage 1: Prune monorepo ────────────────────────────
FROM node:20-slim AS pruner
RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @fetch/bridge --docker

# ── Stage 2: Install dependencies ──────────────────────
FROM node:20-slim AS installer
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm install --frozen-lockfile

# ── Stage 3: Build application ─────────────────────────
FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=@fetch/bridge

# ── Stage 4: Production runtime ────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# System dependencies (Chromium for WhatsApp, Docker CLI, whisper.cpp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium curl ca-certificates gnupg cmake g++ make git \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI (for Kennel control via socket)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli && rm -rf /var/lib/apt/lists/*

# whisper.cpp (local transcription)
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /tmp/whisper \
    && cd /tmp/whisper && cmake -B build && cmake --build build --config Release \
    && cp build/bin/whisper-cli /usr/local/bin/whisper-cli \
    && mkdir -p /app/models \
    && curl -fsSL -o /app/models/ggml-tiny.en.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin \
    && rm -rf /tmp/whisper

# Application code (only compiled output + production deps)
COPY --from=builder /app/apps/bridge/dist ./dist
COPY --from=builder /app/apps/bridge/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WHISPER_MODEL_PATH=/app/models/ggml-tiny.en.bin

EXPOSE 8765

ENTRYPOINT ["sh", "-c", "rm -f /tmp/.chromium-lock* && exec node dist/index.js"]
```

### Volume Mount Updates

Since `fetch-app/` moves to `apps/bridge/`, some volume mounts in `docker-compose.yml` remain the same (they reference `./data`, `./docs`, etc. which are still at root level). No volume changes needed.

---

## CI/CD Updates

### .github/workflows/release.yml Changes

The release workflow needs minimal updates:

```yaml
jobs:
  prepare-manifest:
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build bridge
        run: npx turbo run build --filter=@fetch/bridge

      # ... manifest steps unchanged

  build-manager:
    steps:
      - uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version-file: apps/manager/go.mod    # Updated path

      - name: Build manager archive
        working-directory: apps/manager             # Updated path
        # ... rest unchanged
```

### Adding Remote Caching to CI

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

With these secrets set, every `turbo run` in CI automatically reads from and writes to the remote cache. A build that was already completed on another branch or by another developer is skipped entirely.

### Using turbo-ignore for Conditional Deploys

```yaml
- name: Check if bridge changed
  id: check
  run: npx turbo-ignore @fetch/bridge

- name: Build and deploy bridge
  if: steps.check.outcome == 'failure'  # turbo-ignore exits 1 if changed
  run: docker compose build fetch-bridge && docker compose up -d fetch-bridge
```

This skips the entire Docker build if no files affecting `@fetch/bridge` have changed.

---

## Migration Phases

### Phase 1: Scaffolding (No Behavior Change)

**Goal:** Turborepo running, all existing tasks working, zero functional changes.

1. Create root `package.json` with `workspaces: ["apps/*", "packages/*"]`
2. Create `turbo.json` with task definitions
3. Create `packages/typescript-config/` with shared tsconfig
4. Move `fetch-app/` → `apps/bridge/`
   - Rename package to `@fetch/bridge`
   - Update tsconfig.json to extend `@fetch/typescript-config`
5. Move `manager/` → `apps/manager/`
   - Add shim `package.json`
6. Create empty `packages/types/` placeholder
7. Run `npm install` at root to generate workspace lockfile
8. Verify `turbo run build` succeeds
9. Verify `turbo run test:run` succeeds
10. Update `docker-compose.yml` build contexts
11. Verify `docker compose build` succeeds
12. Update CI workflows with new paths
13. Update `setup-dev.sh`, `deploy.sh`, and install scripts

**Estimated file changes:** ~15 files modified, ~5 files created, 0 files deleted.

**Rollback:** `git revert` — the old structure is fully recoverable.

### Phase 2: Docker Optimization

**Goal:** Use `turbo prune` for lean Docker builds with layer caching.

1. Rewrite `apps/bridge/Dockerfile` to use multi-stage prune pattern
2. Update `.dockerignore` for monorepo layout
3. Verify Docker builds produce identical runtime behavior
4. Benchmark image size reduction

### Phase 3: Package Extraction (Incremental)

**Goal:** Extract shared code into workspace packages as needed.

This phase is **not** a big-bang refactor. Packages are extracted one at a time when:
- Two apps need the same types or utilities
- A module boundary is already clean (e.g., types with no side effects)
- Test isolation improves by separating concerns

Likely candidates:
- `@fetch/types` — Shared TypeScript interfaces (BridgeConfig, SessionData, ToolDefinition, etc.)
- `@fetch/tools` — Tool registry and execution engine (if a second app needs tools)
- `@fetch/agent` — LLM orchestration core (if the agent logic is needed outside the bridge)

### Phase 4: CI Optimization

**Goal:** Maximize CI speed with remote caching and conditional deploys.

1. Set up Vercel remote cache (or self-hosted)
2. Add `TURBO_TOKEN` and `TURBO_TEAM` to GitHub Actions secrets
3. Add `turbo-ignore` checks to skip unchanged service deploys
4. Add `--affected` flag to test runs to only test changed packages

---

## Day-to-Day Developer Experience

### Before vs After

| Task | Before | After |
|------|--------|-------|
| Build everything | `cd fetch-app && npm run build` | `turbo run build` |
| Run tests | `cd fetch-app && npm run test:run` | `turbo run test:run` |
| Dev mode | `cd fetch-app && npm run dev` | `turbo run dev --filter=@fetch/bridge` |
| Build + test | Two separate commands | `turbo run build test:run` (parallel + ordered) |
| Rebuild after no changes | Full tsc recompilation (~5-10s) | Cache hit, instant (~200ms) |
| Add a shared type | Copy-paste between files | `import { Foo } from "@fetch/types"` |
| Docker build | `docker compose build` | Same (but faster with turbo prune) |
| Full stack up | `docker compose up` | Same |
| CI on unchanged code | Full rebuild | Cache hit, skipped |

### Common Commands

```bash
# Build all packages
turbo run build

# Build only the bridge
turbo run build --filter=@fetch/bridge

# Run tests with cache
turbo run test:run

# Dev mode for bridge (with dependencies built first)
turbo run dev --filter=@fetch/bridge

# See what turbo would do without doing it
turbo run build --dry

# Visualize the task graph
turbo run build --graph

# Clean all build outputs
turbo run clean

# Docker (unchanged)
docker compose build
docker compose up -d
docker compose down
```

---

## Trade-offs and Honest Assessment

### Benefits

1. **Build caching eliminates redundant work.** The bridge's TypeScript compilation (~24k LoC) is skipped entirely when source files haven't changed. In CI, this compounds — only the first build per commit is slow.

2. **Workspace packages enable code sharing.** Today, if you wanted shared types between two TypeScript apps, you'd copy-paste. With workspaces, you `import` from `@fetch/types`.

3. **Unified task runner.** One command (`turbo run build`) builds everything in the right order. No need to remember which directories to `cd` into.

4. **Docker builds get faster.** `turbo prune` produces minimal build contexts. The multi-stage pattern separates dependency installation from source compilation for optimal layer caching.

5. **CI gets faster over time.** Remote caching means builds that ran on any branch are available to all other branches. Feature branch CI runs benefit from main branch cache.

### Costs

1. **Migration effort.** Moving directories, updating paths in CI, Docker, and scripts. Phase 1 touches ~15-20 files.

2. **Indirection.** Instead of `cd fetch-app && npm run build`, developers run `turbo run build --filter=@fetch/bridge`. The mental model shifts from "I'm in a directory" to "I'm in a workspace."

3. **Go is a second-class citizen.** Turborepo is designed for JavaScript/TypeScript. The Go manager participates via a shim `package.json`, which works but feels like a workaround. Go's own build caching (`GOCACHE`) is already good.

4. **Single JS package today.** Turborepo's value scales with package count. With only `@fetch/bridge` as a real package, the caching benefit is limited to one build target. The investment pays off more if/when packages are extracted (Phase 3).

5. **Docker build complexity increases.** The multi-stage Dockerfile with `turbo prune` is more complex than the current single-stage approach. It builds faster but is harder to debug when something goes wrong.

6. **Another dependency.** Turborepo itself is a dev dependency that needs to be kept updated. It's actively maintained by Vercel and widely adopted, but it's still another thing in the stack.

### Recommendation

Start with Phase 1 only. It's fully reversible, adds the foundational structure, and gives you caching for the existing bridge build. Evaluate whether to proceed with Phases 2-4 based on:
- How often you're rebuilding unchanged code
- Whether you need shared packages between multiple apps
- Whether CI time is a bottleneck

If the project stays as a single TypeScript app + Go binary + Docker sandbox, the migration is nice-to-have. If it grows to 2+ TypeScript apps or 3+ shared packages, it becomes essential.

---

## Reference Links

- [Turborepo Documentation](https://turborepo.dev/docs)
- [Turborepo + Docker Guide](https://turborepo.dev/docs/guides/tools/docker)
- [turbo.json Configuration Reference](https://turborepo.dev/docs/reference/configuration)
- [Workspace Packages Guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [turbo prune Reference](https://turborepo.dev/docs/reference/prune)
- [Remote Caching Setup](https://turborepo.dev/docs/core-concepts/remote-caching)
- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
