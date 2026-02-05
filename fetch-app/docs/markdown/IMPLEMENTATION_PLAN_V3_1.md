# Fetch v3.1 Implementation Plan - "The Responsive Orchestrator"

> **Status:** Completed (Phase 6 Finish)
> **Previous Version:** [v3.0 Checklist](./IMPLEMENTATION_CHECKLIST.md)
> **Goal:** Runtime dynamism, advanced customization, and user experience polish.

---

## Overview

Fetch v3.0 established the "Orchestrator" architecture (System Rules, Skills, Modes).
Fetch v3.1 makes that architecture **dynamic** and **persistent**. Users can modify the agent's personality, tools, and skills without restarting the server, and the agent remembers its state across crashes or restarts.

---

## Phase 1: Dynamic Identity System
**Goal:** Allow users to customize the agent's persona via Markdown files without code changes.

- [x] **Filesystem Loaders**
  - [x] Implement `loadSystem()` to parse `data/identity/SYSTEM.md` (Core rules)
  - [x] Implement `loadUser()` to parse `data/identity/USER.md` (User info)
  - [x] Implement `loadAgents()` to parse `data/identity/AGENTS.md` (Sub-agent definitions - Parsed as part of System directives)
  - [x] Implement `loadTraits()` to parse `data/identity/TRAITS.md` (Optional modifiers - Parsed as traits section)
- [x] **Hot-Reloading**
  - [x] Watch `data/identity/*` files for changes
  - [x] Rebuild System Prompt dynamically on file change
  - [x] Emit event on identity reload (Logged via Logger)
- [x] **Commands**
  - [x] Implement `/identity reset` (Force reload)
  - [x] Implement `/identity system` to display system identity

## Phase 2: Runtime Management (Skills & Tools)
**Goal:** Enable "Teaching" the agent new capabilities on the fly.

- [x] **Skill Management**
  - [x] Implement `createSkill()` (Minimal)
  - [ ] Implement `updateSkill()` (Deferred to v3.2 - Manual file editing preferred)
  - [ ] Implement `importSkill()` (Deferred)
  - [x] implement `watchSkills()` (Hot-reload `data/skills/*.md`)
  - [x] Add JSON Schema validation for Skill definitions (Via internal parsing logic)
  - [x] Implement `/skill` interface (List, Enable, Disable, Create)
- [x] **Tool Management**
  - [x] Implement `TOOLS.md` loader (Changed to JSON-based `data/tools/*.json` for strict schema)
  - [x] Implement custom tool loading in `ToolRegistry`
  - [x] Implement `/tool` reflex updates for custom tools
  - [x] Support hot-reloading tool definitions via `chokidar`

## Phase 3: Robust State & Persistence
**Goal:** Ensure the agent never loses context, even after a crash.

- [x] **Mode Persistence**
  - [x] Save current `FetchMode` to Session DB (via `meta` table)
  - [x] Restore `FetchMode` on system startup (In `ModeManager.init()`)
  - [x] Implement Crash Recovery Strategy (Reset to `ALERT` vs Resume `WORKING`)
- [x] **Thread Management**
  - [x] Implement `switchThread()` (Save/Restore context snapshots)
  - [x] Implement `createThread()` logic
  - [x] UI: Add thread switching commands (`/thread switch <id>`, `/thread list`)

## Phase 4: Advanced Safety (Guarding Mode)
**Goal:** Make the "Guarding" mode a true safety net for dangerous operations.

- [x] **Confirmation Flow**
  - [x] Enforce specific "Yes/No" state in `GuardingMode` handler
  - [x] Block all other commands until confirmed or denied
  - [x] Auto-trigger `GUARDING` mode on harness questions (via `TaskIntegration`)

## Phase 5: Conversation & Reasoning
**Goal:** Make the agent smarter in long conversations.

- [x] **Summarization**
  - [x] Auto-summarize threads after N messages
  - [x] Store summaries in `conversation_summaries` table
  - [x] Inject recent summaries into Context Window

## Phase 6: UX & Polish
**Goal:** Better visibility and usability.

- [x] **Visual Indicators**
  - [x] Add Mode Emojis to every response (🟢 Alert, 🔵 Working, 🔴 Guarding)
- [x] **Documentation**
  - [x] Professionalize Terminology (Pack Leader -> Orchestrator)
  - [x] Rename Instincts -> Reflexes
  - [x] Create `MIGRATION_V2_TO_V3.md` guide

