---
name: Docker Management
description: Manage Docker containers, images, and compose stacks.
triggers:
  - docker
  - container
  - image
  - compose
  - build image
  - run container
requirements:
  binaries:
    - docker
---

# Docker Management

This skill provides capabilities for managing Docker environments.

## Best Practices
- **Images:** Prefer efficient, small base images (Alpine, Slim).
- **Security:** Do not run as root. Use `.dockerignore`.
- **Compose:** Use `docker-compose.yml` for multi-container coordination.

## Common Operations
1. **Status:** `docker ps` or `docker compose ps`
2. **Logs:** `docker logs -f <id>`
3. **Build:** `docker build -t <tag> .`
4. **Clean:** `docker system prune` (Ask carefully before running)

## Instructions
When writing Dockerfiles, place `COPY . .` last to leverage layer caching.
Always tag images with versions, avoid `latest` in production manifests.
