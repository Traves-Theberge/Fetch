# Competitive Gap Plan

Status: Draft  
Created: 2026-02-14  
Scope: Close high-impact product and operations gaps identified from other agent platforms comparison while keeping Fetch focused on coding orchestration.

## Index

- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Definitions](#definitions)
- [Baseline (Current Fetch)](#baseline-current-fetch)
- [Gap Backlog](#gap-backlog)
- [Release N Plan (Stability + Setup)](#release-n-plan-stability--setup)
- [Release N+1 Plan (Expansion)](#release-n1-plan-expansion)
- [Acceptance Gates](#acceptance-gates)
- [KPIs](#kpis)
- [Risks and Mitigations](#risks-and-mitigations)
- [Open Questions](#open-questions)

## Goals

1. Improve first-run success and reduce setup friction.
2. Strengthen release/install safety to prevent broken public installs.
3. Improve production diagnostics and operational supportability.
4. Keep Fetch architecture focused (WhatsApp-first coding orchestration), not broad assistant sprawl.

## Non-Goals

1. Rebuild Fetch into a general-purpose assistant platform.
2. Add many channels in one cycle.
3. Replace current harness model or tool model.

## Definitions

- Severity:
  - S1 Critical: Breaks install, data integrity, or core production flow.
  - S2 High: Major user-facing friction or high support burden.
  - S3 Medium: Noticeable quality or reliability gap with workaround.
  - S4 Low: Nice-to-have polish.
- Priority:
  - P0: Must complete in current release.
  - P1: Should complete in current release.
  - P2: Planned next release.
- Status:
  - Open, In Progress, Blocked, Done.
- Done Criteria:
  - Code complete.
  - Tests complete.
  - Docs updated.
  - Gate checks pass.

## Baseline (Current Fetch)

- 3-container runtime (`fetch-bridge`, `fetch-kennel`, `searxng`) + Go TUI.
- 29 orchestrator tools; harness delegation via kennel.
- SQLite-backed session/task state with compaction/memory.
- Manifest-based installer and `fetch self` lifecycle commands.
- Recent hardening added rollback and CLI activation checks.

## Gap Backlog

### GAP-COMP-001: Guided Setup Wizard

- Severity: S2
- Priority: P0
- Status: Done
- Outcome: New `fetch setup` command to bootstrap env, validate prerequisites, run auth checks, and guide WhatsApp QR/linking.
- Deliverables:
  - Interactive CLI flow with step resume.
  - Non-interactive mode for CI/automation.
  - Post-setup summary with red/yellow/green status.
  - Optional `--install-missing` mode to install missing harness CLIs automatically.
- Tests:
  - Unit: step state machine.
  - Integration: successful setup from blank host profile.

### GAP-COMP-002: Release Artifact Preflight Gate

- Severity: S1
- Priority: P0
- Status: Done
- Outcome: CI blocks release/manifest update if required files are missing from published archive.
- Required Files:
  - `scripts/install.sh`
  - `scripts/fetch-cli.sh`
  - `VERSION`
  - `docker-compose.yml`
- Tests:
  - Workflow test with intentionally broken archive simulation.

### GAP-COMP-003: Doctor Command Expansion

- Severity: S2
- Priority: P0
- Status: Done
- Outcome: `fetch self doctor` supports `--json` and categorized checks (binary, network, docker, auth, runtime config).
- Deliverables:
  - Stable JSON schema.
  - Exit code semantics by severity.
  - Suggested remediation text for each failing check.

### GAP-COMP-004: Config Validation Commands

- Severity: S2
- Priority: P1
- Status: Done
- Outcome: Add `fetch config validate` and `fetch config doctor`.
- Deliverables:
  - Schema validation for `.env` and runtime config.
  - Unknown-key detection and drift report.
  - Optional auto-fix for safe defaults.

### GAP-COMP-005: Security Runbook + Production Profile

- Severity: S2
- Priority: P1
- Status: Done
- Outcome: Add `docs/markdown/SECURITY_RUNBOOK.md` and hardened deployment profile guidance.
- Deliverables:
  - Secrets handling checklist.
  - Auth mount and token scope guidance.
  - Public-hosting hardening checklist.

### GAP-COMP-006: Uninstall Command

- Severity: S3
- Priority: P2
- Status: Open
- Outcome: Add `fetch self uninstall` to complement `UNINSTALL.md`.
- Deliverables:
  - Default safe mode.
  - `--purge` option.
  - PATH cleanup prompts.

### GAP-COMP-007: Channel Abstraction + One New Channel

- Severity: S3
- Priority: P2
- Status: Open
- Outcome: Introduce channel adapter interface and implement one additional channel.
- Constraints:
  - Preserve WhatsApp as default and best-supported path.
  - No change to core task/tool state model.

### GAP-COMP-008: Setup Health in TUI

- Severity: S3
- Priority: P2
- Status: Open
- Outcome: Add TUI setup health screen that mirrors doctor JSON and highlights next actions.

### GAP-COMP-009: Public Capability Matrix

- Severity: S4
- Priority: P2
- Status: Open
- Outcome: Add one-page capabilities matrix in docs (tools, harnesses, channels, limits, required env).

## Release N Plan (Stability + Setup)

Target: next production release after current `v0.0.50` line.

1. P0
   - GAP-COMP-001 `fetch setup`
   - GAP-COMP-002 release artifact preflight gate
   - GAP-COMP-003 expanded doctor command
2. P1
   - GAP-COMP-004 config validation commands
   - GAP-COMP-005 security runbook + production profile

### Release N Milestones

1. M1: Setup/doctor command contracts finalized.
2. M2: CI release preflight merged and enforced.
3. M3: Docs and runbooks published; end-to-end install test pass.

## Release N+1 Plan (Expansion)

1. P2
   - GAP-COMP-006 uninstall command
   - GAP-COMP-007 channel abstraction + first non-WhatsApp adapter
   - GAP-COMP-008 TUI setup health
   - GAP-COMP-009 capability matrix docs

### Release N+1 Milestones

1. M1: Channel adapter interface merged.
2. M2: New channel beta behind feature flag.
3. M3: TUI setup health + uninstall command shipped.

## Acceptance Gates

### Gate A: Install/Update Reliability

- Fresh install succeeds on Ubuntu x64 and ARM64.
- `fetch` command available in a new shell without manual PATH edits.
- Broken archive is rejected with rollback and clear error.

### Gate B: Diagnostic Quality

- `fetch self doctor --json` returns stable schema.
- At least 90% of common support issues map to one doctor check.

### Gate C: Docs Quality

- Setup/install/uninstall/security docs are internally consistent.
- Each command in docs has at least one tested example.

### Gate D: Release Safety

- Release workflow blocks manifest update on missing required files.
- Manifest updates preserve historical `releases` entries.

## KPIs

1. Fresh install success rate (target: >= 95%).
2. Time-to-first-successful-run (target: <= 15 minutes median).
3. Installer-related support incidents per release (target: -70% vs current baseline).
4. Doctor actionable resolution rate (target: >= 80% without manual intervention).

## Risks and Mitigations

1. Risk: Setup wizard becomes brittle across distros.
   - Mitigation: capability checks + soft-fail + explicit manual fallback.
2. Risk: More commands increase maintenance surface.
   - Mitigation: shared validation library and strict command contract tests.
3. Risk: Channel expansion dilutes focus.
   - Mitigation: feature flag + single adapter in N+1 only.
4. Risk: CI release gating slows release velocity.
   - Mitigation: keep preflight lightweight and deterministic.

## Open Questions

1. Which channel should be first in N+1 (Telegram vs Slack)?
2. Should `fetch setup` auto-install optional host dependencies or only validate?
3. Should `fetch self uninstall` remove Docker images by default or prompt?
