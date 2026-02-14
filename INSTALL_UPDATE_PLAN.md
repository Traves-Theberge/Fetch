# Fetch Install/Update Modernization Plan

## Goal
Provide a stable one-command install (`curl | bash`) and a single `fetch` CLI surface for install health checks, updates, version pinning, and service lifecycle management.

## Scope
- In scope: Linux-first install/update UX, local self-management commands, migration from legacy shell flow.
- Out of scope (phase 1): signed release artifacts, macOS/Windows installers, package manager distribution.

## Current Status
- [x] Canonical installer moved to `scripts/install.sh`
- [x] New local management CLI added at `scripts/fetch-cli.sh`
- [x] Root `install.sh` converted to wrapper (legacy path removed)
- [x] Release manifest + checksum verification
- [ ] Atomic rollback on failed update
- [x] Channel support (`stable` / `beta` / `nightly`)
- [ ] CI install smoke test matrix

## Phase 1: Unified Local Flow

### Objectives
- `curl` bootstrap supported.
- `fetch` command installed to user path.
- Local update path works from existing install.

### Deliverables
- [x] `scripts/install.sh`
- [x] `scripts/fetch-cli.sh`
- [x] Root wrapper `install.sh`
- [x] Documentation updates for new flow

### Acceptance Criteria
- [ ] Fresh machine can run installer without manual repo cloning.
- [ ] `fetch self doctor` reports missing dependencies clearly.
- [ ] `fetch self update` updates repo and rebuilds manager.
- [ ] `fetch up/down/status/logs/tui` work from installed CLI.

## Phase 2: Safe Versioned Updates

### Objectives
- Version-targeted updates and rollback safety.

### Deliverables
- [x] `release-manifest.json` contract
- [x] Checksum verification in installer/updater
- [x] `fetch self pin <version>` via released artifacts
- [ ] Rollback to last good binary on update failure

### Acceptance Criteria
- [ ] Failed update never leaves `fetch` broken.
- [ ] Exact version install works with integrity checks.

## Phase 3: Release and Operations Hardening

### Objectives
- Make updates predictable across environments.

### Deliverables
- [ ] CI builds per arch (`linux/amd64`, `linux/arm64`)
- [ ] Published checksums and release notes automation
- [ ] Install/update smoke tests in CI
- [ ] Migration guide for older installs

### Acceptance Criteria
- [ ] New release publish automatically updates manifest.
- [ ] Smoke tests pass for fresh install + update paths.

## Open Technical Decisions
1. Should updates track `main` by default or latest semver tag?
2. Should `fetch self update` rebuild containers automatically or require `fetch up`?
3. Should installer auto-install dependencies (with sudo) or remain dependency-check-only?

## Immediate Next Tasks
1. Add release-manifest support and checksum verification to installer.
2. Implement staged update + rollback in `fetch self update`.
3. Add CI workflow that tests install and update on clean Linux runners.
