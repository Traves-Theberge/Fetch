---
name: Docker Management
description: Docker container and compose stack orchestration for the Fetch environment.
harnessHint: claude
triggers:
  - docker
  - container
  - compose
  - build image
  - run container
  - kennel
requirements:
  binaries:
    - docker
---

# Docker Management Skill

Guide Fetch to manage Docker containers and the Fetch infrastructure.

## Instructions

When the user asks about Docker status:
1. Delegate via `task_create` with goal: "Run `docker ps` and `docker compose ps` to check container status"
2. Report the results in a concise summary (container names, status, ports)

When the user asks to rebuild or restart containers:
1. Use `ask_user` to confirm which containers to rebuild (fetch-bridge, fetch-kennel, searxng, or all)
2. Delegate via `task_create` with the appropriate `docker compose build <service>` and `docker compose up -d <service>` commands

When the user asks about Docker configuration:
1. Reference `docker-compose.yml` in the project root
2. Explain the three-container architecture: Bridge (Node.js orchestrator), Kennel (Ubuntu sandbox), SearXNG (search engine)

When the user asks to write or modify Dockerfiles:
1. Delegate to **Claude** via `task_create` — Dockerfiles need careful layering and security review

## Safety Rules

- **Never run `docker system prune`** without explicit confirmation via `ask_user`
- **Never stop the fetch-bridge container** from within itself — warn the user this would disconnect Fetch
- **Always confirm** before rebuilding containers that are currently running

## Harness Routing

- Dockerfile writing/optimization → **Claude** (needs careful reasoning about layers, security)
- Quick status checks, log viewing → **Gemini** (fast, simple commands)
- Docker compose changes → **Claude** (multi-file, architectural)

## Tool Reference

- `task_create` — Delegate Docker commands to a harness in the Kennel
- `ask_user` — Confirm destructive operations (prune, rebuild, stop)
- `report_progress` — Send status updates during long builds
