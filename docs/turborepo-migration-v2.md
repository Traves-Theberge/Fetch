# Turborepo Migration Plan for Fetch (v2)

> Synthesized from the original proposal, ChatGPT review feedback, and primary-source verification against the official Turborepo docs, npm docs, and ecosystem best practices. Every claim in this document has been cross-checked.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Current Architecture](#current-architecture)
- [Why Turborepo](#why-turborepo)
- [Proposed Monorepo Structure](#proposed-monorepo-structure)
- [Why Kennel Stays Top-Level](#why-kennel-stays-top-level)
- [turbo.json — The Right Way](#turbojson--the-right-way)
- [Root package.json](#root-packagejson)
- [Package Configurations](#package-configurations)
- [Turborepo + Docker Compose Best Practices](#turborepo--docker-compose-best-practices)
- [The Dockerfile — Corrected](#the-dockerfile--corrected)
- [Environment Variables and .env — Getting This Right](#environment-variables-and-env--getting-this-right)
- [CI/CD Updates](#cicd-updates)
- [Migration Phases](#migration-phases)
- [Day-to-Day Developer Experience](#day-to-day-developer-experience)
- [Trade-offs and Honest Assessment](#trade-offs-and-honest-assessment)
- [Gotchas That Will Bite You](#gotchas-that-will-bite-you)
- [Reference Links](#reference-links)

---

## Executive Summary

Fetch is a polyglot project — TypeScript bridge, Go TUI, Docker sandbox — with three independent build systems and no shared task orchestration. This document proposes migrating to a Turborepo-managed npm workspace to gain build caching, parallel task execution, and an internal package system.

The migration is incremental and reversible. Phase 1 adds Turborepo scaffolding with zero functional changes. Later phases extract shared packages and optimize CI/Docker.

---

## Current Architecture

```
Fetch/                          # No root package.json, no workspace config
├── fetch-app/                  # Node.js/TypeScript bridge (npm, ~24k LoC)
│   ├── package.json            # "fetch-bridge", type: module, TS 5.9
│   ├── tsconfig.json           # Standalone, no shared base
│   ├── vitest.config.ts        # Vitest + v8 coverage
│   ├── Dockerfile              # Multi-stage: tsc + Chromium + whisper.cpp
│   ├── src/                    # bridge, agent, harness, skills, tools, session...
│   └── tests/                  # unit/ + integration/
│
├── manager/                    # Go TUI (~6.7k LoC, Bubble Tea)
│   ├── go.mod                  # Go 1.24
│   ├── main.go
│   └── build.sh                # Multi-arch (amd64 + arm64)
│
├── kennel/                     # AI CLI execution sandbox
│   └── Dockerfile              # Ubuntu + node + 5 AI CLIs + Playwright
│
├── docker-compose.yml          # 3 services: bridge, kennel, searxng
├── scripts/                    # install, deploy, harness management
├── .github/workflows/          # release, manager-build, install-smoke
└── VERSION                     # 0.0.96
```

### What Each Component Does

**fetch-app (the Bridge)** — TypeScript app that connects to WhatsApp/Discord, orchestrates an LLM agent pipeline, dispatches tool calls, manages sessions in SQLite, and controls the Kennel container via the Docker socket.

**manager (the TUI)** — Go binary providing terminal UI for setup, config, logs, and status. Connects to the bridge's HTTP API on port 8765. Distributed as GitHub Release artifacts (linux/amd64 + arm64).

**kennel (the Sandbox)** — Docker image containing AI CLI tools (Copilot, Claude Code, Gemini, OpenCode, Codex) plus git, Python, Playwright, and a browser agent. The bridge `exec`s commands into this running container. It has no application source code — it's a toolbox image.

**searxng** — Third-party image (`searxng/searxng:latest`). Private meta-search engine. Config files mounted, no build step.

### Problems This Migration Solves

1. **No caching** — Every `npm run build` recompiles all TypeScript regardless of what changed.
2. **No shared config** — `tsconfig.json` is standalone. Adding a second TS package means duplicating it.
3. **No workspace protocol** — No way to share types or utilities across packages via `import`.
4. **No unified task runner** — Building the project requires knowing which directories and commands in which order.
5. **No dependency graph** — Nothing understands that tests depend on build, or that shared types must compile first.

---

## Why Turborepo

| Capability | What It Does for Fetch |
|---|---|
| **Content-addressed caching** | Hashes inputs (source, deps, env vars, config). If nothing changed, restores outputs from cache instead of re-running the task. |
| **Task graph execution** | Builds a DAG of tasks across all packages. Runs everything with maximum parallelism while respecting `dependsOn` ordering. |
| **npm workspaces** | Internal `@fetch/*` packages linked locally via symlinks. Import shared code like any npm dependency. |
| **`turbo prune --docker`** | Produces a minimal workspace subset for Docker builds. Splits dependency metadata from source code for optimal layer caching. |
| **Remote caching** | Shares build artifacts across CI runners and developers. A build on branch A populates the cache; branch B gets instant hits for unchanged packages. |
| **`turbo-ignore`** | Skips entire CI jobs when a package has no changes. Avoids even provisioning containers for unaffected services. |

---

## Proposed Monorepo Structure

```
Fetch/
├── apps/
│   ├── bridge/                     # fetch-app → renamed
│   │   ├── package.json            # "@fetch/bridge"
│   │   ├── turbo.json              # package-level task overrides (optional)
│   │   ├── tsconfig.json           # extends @fetch/typescript-config
│   │   ├── vitest.config.ts
│   │   ├── Dockerfile
│   │   ├── src/
│   │   └── tests/
│   │
│   └── manager/                    # Go TUI with shim package.json
│       ├── package.json            # "@fetch/manager"
│       ├── turbo.json              # package-level: overrides outputs for Go binary
│       ├── go.mod
│       ├── go.sum
│       ├── main.go
│       └── build.sh
│
├── packages/
│   ├── typescript-config/          # Shared tsconfig base
│   │   ├── package.json            # "@fetch/typescript-config"
│   │   └── base.json
│   │
│   └── types/                      # Shared TypeScript types (starts small)
│       ├── package.json            # "@fetch/types"
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
│
├── kennel/                         # STAYS HERE (see section below)
│   └── Dockerfile
│
├── config/                         # Runtime config (searxng)
├── data/                           # Persistent data (gitignored)
├── workspace/                      # Shared Docker volume
├── scripts/                        # Install + deployment scripts
├── docs/
├── .github/workflows/
│
├── package.json                    # Root workspace manifest
├── turbo.json                      # Root task pipeline
├── .npmrc
├── .dockerignore                   # Monorepo-aware
├── docker-compose.yml              # Updated build contexts
└── VERSION
```

### Why `apps/` and `packages/`?

This is the canonical Turborepo convention. From the [structuring guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository):

- **`apps/`** — Deployable applications. These are the "end" of the package graph; nothing else imports from them.
- **`packages/`** — Shared libraries and configuration. These are imported by apps and by each other.

Turborepo discovers packages by scanning directories listed in the root `package.json` `workspaces` field for child `package.json` files. Each one with a `name` field becomes a node in the package graph.

---

## Why Kennel Stays Top-Level

Kennel is intentionally **not** moved into `apps/` and does **not** get a `package.json`. This is a deliberate architectural decision.

### 1. No Application Source Code

Kennel is a Dockerfile that installs system packages and AI CLI tools. There is no JavaScript, TypeScript, or Go source code. Nothing for Turborepo to build, test, lint, or cache.

### 2. Turborepo Cannot Cache Docker Images

Turborepo caches task outputs as files on the filesystem (`.turbo/cache/`). Docker images live in Docker's own layer cache and image store. There is no way for Turborepo to hash Docker build inputs correctly (base images change, `apt-get` results vary), store images in its cache format, or restore them.

### 3. Zero Workspace Dependencies

Kennel doesn't depend on `@fetch/bridge`, `@fetch/types`, or any internal package. Adding it to the workspace graph would create a node with no edges — pure overhead.

### 4. Different Lifecycle

Kennel is rebuilt rarely (when CLI tools need updating). The bridge is rebuilt on every code change. Coupling them in the same task graph would either force unnecessary Kennel rebuilds or add a confusing no-op node to every `turbo run build`.

### 5. Runtime Dependency, Not Build Dependency

The bridge connects to Kennel at runtime via the Docker socket (`dockerode`). This is an infrastructure relationship managed by Docker Compose's `depends_on`, not a code dependency managed by Turborepo's `dependsOn`.

### 6. We Considered a Shim — and Rejected It

We *could* add a `@fetch/kennel` shim `package.json` with `"build": "docker build ."`. We intentionally don't because:
- Docker's own layer cache already handles Kennel builds efficiently
- A Turborepo wrapper adds coupling without improving cache behavior
- It would confuse the task graph with a fundamentally different build mechanism

### 7. Ecosystem Precedent

Major Turborepo monorepos (Vercel, Cal.com, t3-oss) follow the same pattern: infrastructure-only Docker images, Terraform configs, and Helm charts live outside `apps/` and `packages/`.

---

## turbo.json — The Right Way

The original proposal had a single `inputs` list mixing TypeScript and Go globs across all packages. This is wrong — `*.go` is meaningless noise in TS packages, `src/**` doesn't exist in the Go manager, and you get unexpected cache behavior because `inputs` is shared across all packages that have the task.

The correct approach: **keep the root `turbo.json` minimal and use package-level `turbo.json` for overrides.**

### Root `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["VERSION"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test:run": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
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

### What's Different from v1 (and Why)

**No `.env` in `globalDependencies`.** The root `.env` is a symlink to a runtime secrets file. It's untracked, runtime-only, and doesn't affect TypeScript compilation output. Including it would cause "why did everything rebuild?" confusion every time a secret rotates. See the [environment variables section](#environment-variables-and-env--getting-this-right) below.

**No cross-language `inputs` list.** Turborepo's default input behavior (all Git-tracked files in the package) is already correct for most cases. Each package only contains files relevant to its own build. Custom `inputs` should be per-package overrides, not a root-level catchall.

**No `test` task (watch mode).** Only `test:run` (single execution, deterministic, cacheable). The watch-mode `vitest` is invoked directly when needed — it's a developer tool, not a pipeline task.

**`outputs: ["dist/**"]`** — Without this key, Turborepo doesn't cache any files. This is the most common misconfiguration. From the [task configuration guide](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks): "Without outputs, Turborepo will not cache any files."

### Package-Level Override: `apps/manager/turbo.json`

```json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": ["fetch-manager-*"]
    }
  }
}
```

This tells Turborepo: "For the `@fetch/manager` package, the `build` task produces binary files matching `fetch-manager-*` instead of `dist/**`."

The `"extends": ["//"]` is mandatory for package-level configs — it inherits all other task definitions from the root `turbo.json`. Without it, the file is invalid.

### Why This Is Better

| Concern | Root-level catchall (v1) | Minimal root + per-package (v2) |
|---|---|---|
| TS packages see `*.go` in inputs | Yes (noise, no effect but confusing) | No |
| Go package sees `src/**` in inputs | Yes (doesn't exist, ignored) | No |
| Adding a new package type | Must update root inputs list | Just add a package-level turbo.json |
| Cache correctness | Fragile (shared inputs may over/under-match) | Robust (each package declares its own) |

---

## Root package.json

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
    "dev": "turbo run dev",
    "clean": "turbo run clean"
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

- **`"private": true`** — Prevents accidental npm publication of the root.
- **`"workspaces"`** — npm's native workspace feature. Directories matching `apps/*` and `packages/*` with a `package.json` are automatically linked via symlinks in the root `node_modules`.
- **`"packageManager"`** — Declares the expected npm version. Corepack (bundled with Node 20+) can enforce this. Turborepo will warn if the actual package manager doesn't match.
- **No Docker scripts in root** — Docker Compose has its own orchestration. Wrapping `docker compose` in npm scripts adds a layer of indirection with no benefit.

---

## Package Configurations

### `apps/bridge/package.json`

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

### `apps/manager/package.json`

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

Minimal shim. No dependencies. Turborepo discovers this package and runs `bash build.sh` when `turbo run build` is invoked. The Go toolchain must be installed on the host — npm doesn't manage it.

The corresponding `apps/manager/turbo.json` (shown above) overrides `outputs` to cache the Go binary instead of `dist/`.

**Caveat:** Go's own build cache (`GOCACHE`) is already fast. Turborepo caching adds value in CI (skip the entire Go build if no `.go` files changed) but less value locally.

### `packages/typescript-config/package.json`

```json
{
  "name": "@fetch/typescript-config",
  "version": "0.0.1",
  "private": true,
  "files": ["base.json"]
}
```

### `packages/typescript-config/base.json`

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

### `apps/bridge/tsconfig.json` (updated to extend shared config)

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

### `packages/types/package.json`

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

Starts empty or with a handful of shared interfaces. Types are extracted incrementally, not in a big-bang refactor.

---

## Turborepo + Docker Compose Best Practices

### Principle 1: Turborepo Builds Code, Docker Compose Builds Infrastructure

Draw a hard line:

| Turborepo Handles | Docker Compose Handles |
|---|---|
| TypeScript compilation | Container image assembly |
| Test execution | Service dependencies (`depends_on`) |
| Linting | Volume mounts & networking |
| Internal package resolution | Runtime orchestration |
| Build caching & parallelism | Infrastructure-only images (kennel, searxng) |

### Principle 2: Use `turbo prune --docker` for Lean Docker Builds

From the [official Docker guide](https://turborepo.dev/docs/guides/tools/docker): `turbo prune` creates a partial monorepo for a target package. The `--docker` flag splits output for optimal Docker layer caching:

```
out/
├── json/               # package.json files + pruned lockfile (dependency layer)
├── full/               # Complete source code (build layer)
└── package-lock.json   # Pruned lockfile with only relevant dependencies
```

This separation is the key insight: dependency installation (`npm ci`) changes rarely, source code changes often. By copying them in separate Docker layers, you avoid re-running `npm ci` on every source code change.

### Principle 3: Docker Build Context Must Be the Monorepo Root

Because `turbo prune` needs access to the full workspace structure (root `package.json`, `turbo.json`, all packages), the Docker build context must be the repository root:

```yaml
# docker-compose.yml
services:
  fetch-bridge:
    build:
      context: .                            # Root, not ./apps/bridge
      dockerfile: apps/bridge/Dockerfile
```

**Warning:** This increases the size of the build context sent to the Docker daemon. A tight `.dockerignore` is critical (see below).

### Principle 4: .dockerignore Must Be Aggressive

```dockerignore
# Dependencies (reinstalled in Docker)
**/node_modules

# Build outputs (rebuilt in Docker)
**/dist

# Turborepo cache
.turbo

# Git history
.git

# Runtime data
data/
workspace/

# Go artifacts (manager built separately in CI)
apps/manager/fetch-manager-*

# IDE / OS
.vscode
.idea
.DS_Store

# Secrets (injected at runtime)
.env
.env.*
!.env.example
```

Without this, the build context can balloon to hundreds of megabytes — `node_modules` alone will be huge in a monorepo.

### Principle 5: Non-JS Services Stay Outside Turborepo

```yaml
services:
  fetch-bridge:
    build:
      context: .
      dockerfile: apps/bridge/Dockerfile     # Turborepo builds this

  fetch-kennel:
    build:
      context: ./kennel                       # Pure Docker, no Turborepo
      dockerfile: Dockerfile

  searxng:
    image: searxng/searxng:latest             # Pre-built, no build step
```

### Principle 6: Don't Run `turbo` as the Docker Entrypoint

Turborepo is a build-time tool. The container runs the compiled application:

```dockerfile
# Correct
CMD ["node", "dist/index.js"]

# Wrong — unnecessary overhead, wrong abstraction layer
CMD ["npx", "turbo", "run", "start", "--filter=@fetch/bridge"]
```

### Principle 7: BuildKit Cache Mounts (Advanced, Optional)

Docker BuildKit supports persistent cache mounts across builds:

```dockerfile
RUN --mount=type=cache,target=/app/.turbo \
    npx turbo run build --filter=@fetch/bridge
```

This preserves Turborepo's local cache between Docker builds. Minor source changes become near-instant even inside Docker. This is an optimization for Phase 2+, not a requirement.

---

## The Dockerfile — Corrected

The original proposal used `npm install --frozen-lockfile`. **That flag doesn't exist in npm.** It's a Yarn/pnpm flag. The npm equivalent is `npm ci` (Clean Install), which:

- Deletes `node_modules` entirely and recreates from scratch
- Installs exact versions from `package-lock.json` (never updates the lockfile)
- Fails if `package.json` and `package-lock.json` are out of sync
- Is faster than `npm install` for clean installations

This matters for Docker: `npm ci` guarantees reproducible, deterministic dependency layers.

### Corrected `apps/bridge/Dockerfile`

```dockerfile
# ── Stage 1: Prune monorepo ────────────────────────────
FROM node:20-slim AS pruner
RUN npm install -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @fetch/bridge --docker

# ── Stage 2: Install dependencies (cached layer) ──────
FROM node:20-slim AS installer
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy ONLY package.json files + pruned lockfile
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# npm ci — NOT npm install --frozen-lockfile (that's a Yarn flag)
RUN npm ci

# ── Stage 3: Build application ─────────────────────────
FROM installer AS builder
WORKDIR /app

# Copy full source code
COPY --from=pruner /app/out/full/ .

# Build via Turborepo (respects dependsOn ordering)
RUN npx turbo run build --filter=@fetch/bridge

# ── Stage 4: Production runtime ────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# System dependencies: Chromium (WhatsApp), Docker CLI (Kennel control)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium curl ca-certificates gnupg cmake g++ make git \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) \
       signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# whisper.cpp (local transcription)
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /tmp/whisper \
    && cd /tmp/whisper && cmake -B build && cmake --build build --config Release \
    && cp build/bin/whisper-cli /usr/local/bin/whisper-cli \
    && mkdir -p /app/models \
    && curl -fsSL -o /app/models/ggml-tiny.en.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin \
    && rm -rf /tmp/whisper

# Only copy compiled output + production dependencies
COPY --from=builder /app/apps/bridge/dist ./dist
COPY --from=builder /app/apps/bridge/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WHISPER_MODEL_PATH=/app/models/ggml-tiny.en.bin

EXPOSE 8765

ENTRYPOINT ["sh", "-c", "rm -f /tmp/.chromium-lock* && exec node dist/index.js"]
```

### Why Four Stages

| Stage | Invalidated When | Cost |
|---|---|---|
| **pruner** | Any file changes | Cheap (file copy + prune) |
| **installer** | `package.json` or lockfile changes | Expensive (`npm ci`), but cached when only source changes |
| **builder** | Source code changes | Moderate (`tsc`), deps already installed |
| **runner** | Builder output changes | Only copies compiled artifacts |

The key optimization: source code changes (frequent) don't re-trigger `npm ci` (slow). Only dependency changes do.

---

## Environment Variables and .env — Getting This Right

This is the section most likely to cause subtle bugs if done wrong. The original proposal put `.env` in `globalDependencies`. Here's why that's problematic and what to do instead.

### The Problem with `.env` in `globalDependencies`

From the [Turborepo env guide](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables):

> "Changes to the values of any environment variables in [globalDependencies] will change the hash for **all** tasks."

The root `.env` in Fetch is:
1. **A symlink** to `~/repos/traves/dogpark/.env`
2. **Untracked** by git (in `.gitignore`)
3. **Runtime-only** — contains API keys, tokens, phone numbers
4. **Not used during `tsc` compilation** — TypeScript doesn't read `.env` at build time

If `.env` is a `globalDependency`, every time you rotate an API key, every build cache in the entire monorepo is invalidated. You'd get "why did everything rebuild?" confusion constantly.

### What to Do Instead

**Separate build-time vars from runtime vars:**

```json
{
  "globalDependencies": ["VERSION"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "env": ["FETCH_*"]
    }
  }
}
```

- **`VERSION`** in `globalDependencies` — This file is tracked, changes rarely, and a version bump should invalidate all caches. Correct.
- **`NODE_ENV`** in `globalEnv` — Affects all tasks (dev vs prod compilation). Correct.
- **`FETCH_*`** in task-level `env` — Only affects the `build` task, and only if you have build-time feature flags prefixed with `FETCH_`. Only include this if these vars actually change build output.

**If `.env` values genuinely affect build output** (rare for TypeScript, common for Next.js with `NEXT_PUBLIC_*`), add it as a per-task input instead of a global dependency:

```json
{
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", ".env.production"]
    }
  }
}
```

The `$TURBO_DEFAULT$` microsyntax preserves default input behavior (all Git-tracked files) while adding `.env.production` on top.

### Important: Turborepo Does Not Load .env Files

From the [docs](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables):

> "Turborepo does not load .env files into your task's runtime."

That's the framework's job (dotenv in Fetch's case). Turborepo only uses `.env` for cache hashing if you put it in `inputs` or `globalDependencies`.

### Recommended .env Strategy for Fetch

| File | Purpose | In turbo.json? |
|---|---|---|
| `.env` (root, symlink) | Runtime secrets (API keys, tokens) | **No** — doesn't affect build output |
| `VERSION` | Release version string | **Yes** — `globalDependencies` |
| `NODE_ENV` | Dev/prod mode | **Yes** — `globalEnv` |
| `.env.production` (if created later) | Build-time prod config | Per-task `inputs` if needed |

---

## CI/CD Updates

### Updated `release.yml`

```yaml
jobs:
  prepare-manifest:
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # Full history needed for turbo-ignore

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Build bridge
        run: npx turbo run build --filter=@fetch/bridge
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ secrets.TURBO_TEAM }}

      # ... manifest steps unchanged

  build-manager:
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: apps/manager/go.mod    # Updated path

      - name: Build manager
        working-directory: apps/manager             # Updated path
        # ... rest unchanged
```

### Remote Caching

With `TURBO_TOKEN` and `TURBO_TEAM` set as environment variables, every `turbo run` in CI automatically reads from and writes to the remote cache. No code changes needed — Turborepo detects these env vars automatically.

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

### Skipping Unchanged Packages with `turbo-ignore`

From the [skipping tasks guide](https://turborepo.dev/docs/guides/skipping-tasks):

`turbo-ignore` compares Git history to determine if a package has changes that would affect a task. It runs `turbo run <task> --filter=<package>...<parent-commit> --dry=json` internally and returns:
- Exit code `0` = no changes, skip the task
- Exit code `1` = changes detected, run the task

```yaml
- name: Check if bridge changed
  id: check
  continue-on-error: true
  run: npx turbo-ignore @fetch/bridge

- name: Build and deploy bridge
  if: steps.check.outcome == 'failure'
  run: docker compose build fetch-bridge
```

**Requirement:** Git history must be available. Use `fetch-depth: 0` (full clone) or at least `fetch-depth: 2` in your checkout step. Shallow clones with `fetch-depth: 1` will cause `turbo-ignore` to fail or always report changes.

---

## Migration Phases

### Phase 1: Scaffolding (Zero Behavior Change)

**Goal:** Turborepo running, all existing tasks working, nothing functionally different.

1. Create root `package.json` with `workspaces: ["apps/*", "packages/*"]`
2. Create root `turbo.json`
3. Create `packages/typescript-config/` with shared tsconfig
4. Create `packages/types/` as empty placeholder
5. Move `fetch-app/` → `apps/bridge/`
   - Rename package to `@fetch/bridge`
   - Update `tsconfig.json` to extend `@fetch/typescript-config`
6. Move `manager/` → `apps/manager/`
   - Add shim `package.json`
   - Add package-level `turbo.json` for Go binary outputs
7. Run `npm install` at root to generate workspace lockfile
8. Verify: `turbo run build` succeeds
9. Verify: `turbo run test:run` passes
10. Update `docker-compose.yml` build contexts
11. Verify: `docker compose build` succeeds
12. Update `.dockerignore` for monorepo layout
13. Update CI workflows with new paths
14. Update `setup-dev.sh`, `deploy.sh`, and install scripts

**Files changed:** ~15 modified, ~8 created, 0 deleted.

**Rollback:** `git revert` — the old structure is fully recoverable.

### Phase 2: Docker Optimization

**Goal:** Use `turbo prune` for optimized Docker layer caching.

1. Rewrite `apps/bridge/Dockerfile` to the four-stage pattern (shown above)
2. Update `.dockerignore`
3. Verify Docker builds produce identical runtime behavior
4. Benchmark: compare image sizes and build times before/after

### Phase 3: Package Extraction (Incremental, As-Needed)

**Goal:** Extract shared code when the need arises.

This is **not** a big-bang refactor. Extract packages one at a time when:
- Two apps need the same types or utilities
- A module boundary is already clean
- Test isolation would improve from separation

Candidates (in priority order):
1. `@fetch/types` — Shared TypeScript interfaces
2. `@fetch/tools` — Tool registry (if a second app needs tools)
3. `@fetch/agent` — LLM orchestration (if reused outside the bridge)

### Phase 4: CI Optimization

**Goal:** Maximize CI speed.

1. Set up Vercel remote cache (or self-hosted)
2. Add `TURBO_TOKEN` + `TURBO_TEAM` to GitHub Actions secrets
3. Add `turbo-ignore` for conditional deploys
4. Use `--affected` flag: `turbo run test:run --affected`
5. Ensure `fetch-depth: 0` in checkout steps (required for `--affected` and `turbo-ignore`)

---

## Day-to-Day Developer Experience

### Before → After

| Task | Before | After |
|------|--------|-------|
| Build everything | `cd fetch-app && npm run build` | `turbo run build` |
| Run tests | `cd fetch-app && npm run test:run` | `turbo run test:run` |
| Dev mode | `cd fetch-app && npm run dev` | `turbo run dev --filter=@fetch/bridge` |
| Build + test | Two separate commands | `turbo run build test:run` (parallel + ordered) |
| Rebuild, nothing changed | Full `tsc` recompilation | Cache hit (~200ms) |
| Add a shared type | Copy-paste between files | `import { Foo } from "@fetch/types"` |
| Docker build | `docker compose build` | Same command (faster with prune) |
| Full stack up | `docker compose up -d` | Same command |
| CI on unchanged code | Full rebuild | Skipped via cache or `turbo-ignore` |

### Common Commands

```bash
# Build all packages (with caching)
turbo run build

# Build only the bridge (and its dependencies)
turbo run build --filter=@fetch/bridge

# Run tests
turbo run test:run

# Dev mode for bridge
turbo run dev --filter=@fetch/bridge

# Preview what turbo would do
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

### What You Gain

1. **Build caching eliminates redundant work.** ~24k LoC of TypeScript compilation skipped when nothing changed. In CI, only the first build per commit is slow.

2. **Workspace packages enable code sharing.** `import { Thing } from "@fetch/types"` instead of copy-paste or `../../../` imports. The [structuring guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) explicitly warns: "If you ever find yourself writing `../` to get from one package to another, reconsider your architecture."

3. **Unified task runner.** One command builds everything in the right order. No mental model of "which directory, which command, which order."

4. **Docker builds get faster.** `turbo prune` + multi-stage pattern separates dependency installation from source compilation. Source-only changes don't re-run `npm ci`.

5. **CI acceleration compounds.** Remote caching shares artifacts across branches and developers. Feature branch CI benefits from main branch cache.

### What It Costs

1. **Migration effort.** Phase 1 touches ~20 files. Moving directories and updating paths in CI/Docker/scripts is the bulk of the work.

2. **Mental model shift.** Developers think "workspace" instead of "directory." `turbo run build --filter=@fetch/bridge` instead of `cd fetch-app && npm run build`.

3. **Go is a second-class citizen.** Turborepo is designed for JS/TS. The Go manager works via a shim `package.json`, which is functional but not idiomatic Go tooling. Go's own `GOCACHE` is already fast for local dev.

4. **Single JS package today.** Turborepo's value scales with package count. With only `@fetch/bridge`, caching is limited to one build target. The investment pays off more when packages are extracted (Phase 3).

5. **Dockerfile complexity increases.** Four stages instead of two. Builds faster but harder to debug. `turbo prune` output structure must be understood.

6. **Another dependency.** Turborepo itself needs updates. It's actively maintained by Vercel and widely adopted, but it's one more thing in the stack.

### When This Becomes Essential

- When you add a second TypeScript application
- When you extract 2+ shared packages
- When CI time becomes a bottleneck
- When multiple developers need shared build cache

### When This Is Nice-to-Have

- Single TypeScript app + Go binary + Docker sandbox (today's state)
- Solo developer with fast local rebuilds
- Infrequent CI runs

---

## Gotchas That Will Bite You

### 1. `npm install --frozen-lockfile` Doesn't Exist

This is a Yarn/pnpm flag. npm's equivalent is `npm ci`. Using `--frozen-lockfile` with npm will be silently ignored (it doesn't error), meaning your Docker builds are not actually deterministic. Always use `npm ci` in Dockerfiles and CI.

### 2. Changing Root `package.json` Dependencies Invalidates Everything

From the [configuration docs](https://turborepo.dev/docs/reference/configuration): changes to root `package.json` dependencies affect the workspace-level lockfile, which causes all task caches to miss. Avoid putting application dependencies in the root `package.json` — only put `turbo` and truly global dev tools there.

### 3. Custom `inputs` Opts Out of `.gitignore`

From the [task configuration guide](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks): when you specify custom `inputs`, `.gitignore` rules are no longer respected for input hashing. Use `$TURBO_DEFAULT$` to preserve default behavior while adding/removing specific files.

### 4. Empty `outputs` = No File Caching

An empty `"outputs": []` or omitted `outputs` key means Turborepo won't cache any files for that task. Logs are still cached, but build artifacts aren't restored. This is the most common misconfiguration. Always declare `outputs` for tasks that produce files.

### 5. `turbo-ignore` Needs Git History

`turbo-ignore` and `--affected` compare against previous commits. A shallow clone (`fetch-depth: 1`) means there's no parent commit to compare against. Use `fetch-depth: 0` or at minimum `fetch-depth: 2`.

### 6. Docker Build Context Size

With `context: .` (monorepo root), the entire repo is sent to the Docker daemon as build context. Without a tight `.dockerignore`, this includes `node_modules`, `.git`, `data/`, and everything else. A 50MB repo becomes a 500MB build context. The `.dockerignore` in this document is not optional.

### 7. `passThroughEnv` Does NOT Affect Cache

From the [config reference](https://turborepo.dev/docs/reference/configuration): `passThroughEnv` makes variables available at runtime but does NOT contribute to cache keys. If a variable changes build output, it must go in `env` or `globalEnv`, not `passThroughEnv`.

### 8. Turborepo Does Not Load .env Files

Turborepo uses `.env` files for cache hashing if declared, but never loads them into task runtime. Your application framework (dotenv) handles that. Don't expect `TURBO_*` config to load from `.env`.

### 9. Nested Package Globs Don't Work

Turborepo doesn't support `apps/**/` (recursive workspace patterns). A structure with packages at both `apps/a` and `apps/a/b` will error. Use flat, non-overlapping globs: `apps/*`, `packages/*`.

### 10. Package Configs Must Start with `"extends": ["//"]`

Every `turbo.json` inside a package directory must extend the root config. Without `"extends": ["//"]`, the file is invalid and Turborepo will error. The `//` is a special token meaning "root turbo.json."

---

## Reference Links

### Turborepo Official Docs
- [Getting Started](https://turborepo.dev/docs)
- [Structuring a Repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [Configuring Tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)
- [Using Environment Variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables)
- [turbo.json Configuration Reference](https://turborepo.dev/docs/reference/configuration)
- [Docker Integration Guide](https://turborepo.dev/docs/guides/tools/docker)
- [`turbo prune` Reference](https://turborepo.dev/docs/reference/prune)
- [Skipping Tasks (`turbo-ignore`)](https://turborepo.dev/docs/guides/skipping-tasks)
- [Package and Task Graph](https://turborepo.dev/docs/core-concepts/package-and-task-graph)

### npm
- [`npm ci` Documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- [npm Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [npm ci vs npm install](https://www.baeldung.com/ops/npm-install-vs-npm-ci)

### Community Discussion
- [Composing Environment Variables (GitHub Discussion #9458)](https://github.com/vercel/turborepo/discussions/9458)
- [Best Use of `turbo prune --docker` (Vercel Community)](https://community.vercel.com/t/how-do-i-make-the-best-use-of-turbo-prune-docker/31850)
