# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **TUI Redesign** - Complete visual overhaul using Charmbracelet ecosystem
  - Horizontal layout: ASCII dog mascot on left, menu on right
  - Bottom-aligned content across all views
  - Neofetch-style version screen (`v` key or menu)
  - Dynamic header sizing based on terminal height
  - Theme package with consistent color palette (Primary orange, Teal accents)
  - Layout package for responsive frame management
  - Components package (header, splash, version, statusbar, menu)
- **Model Selector in TUI** - Select AI model directly from the manager
  - Fetches available models from OpenRouter API
  - Shows recommended models (GPT-4o, Claude, Gemini, Llama, etc.)
  - Tab to toggle between recommended and all models
  - Saves selection to `AGENT_MODEL` in `.env`
  - Price display per model
- **Self-chat support** - Send messages to yourself for testing
  - Uses `message_create` event instead of `message`
  - Properly handles `fromMe` messages with @fetch trigger
- **D3.js diagram system** - Beautiful interactive diagrams throughout documentation
  - 6 diagram types: architecture, security, react, tools, dataflow, session
  - Dark/light theme aware with automatic color adaptation
  - Responsive sizing for all screen sizes
  - Print-friendly styles
- **Command Reference page** - New `COMMANDS.md` with complete WhatsApp command documentation
  - All built-in commands with aliases
  - Approval responses and natural language examples
  - Response format examples
- **@fetch trigger system** - All messages must now start with `@fetch` prefix
  - Works in both direct messages and group chats
  - Case-insensitive matching
  - Owner verification for group messages via participant ID
- **Enhanced logging system** - Beautiful, human-readable logs with:
  - Colored output with ANSI codes (timestamps, icons, levels)
  - Section headers with box drawing characters
  - Log levels: debug 🔍, info 📘, warn ⚠️, error ❌, success ✅, message 💬
  - Utility functions: `logger.section()`, `logger.divider()`, `logger.box()`
- **QR code in TUI** - ASCII QR code rendering directly in terminal
  - Added `github.com/skip2/go-qrcode` library
  - Press 'o' to open QR URL in browser
  - Press 'r' to refresh status
- **Documentation site** - Beautiful HTML docs with HLLM design system
  - Dark/light theme support
  - Sidebar navigation with all docs
  - Served from bridge container at `/docs`
  - Accessible from TUI via 📚 Documentation menu

### Changed
- **Manager Menu Streamlined** - Reduced from 11 to 9 items
  - Removed "Status" (info now in header/statusbar)
  - Removed "Update" (use git manually for more control)
- **Kennel Description** - Changed from "Claude Computer Use Agents" to "Multi-Model AI Agent Orchestrator"
- **Version Display** - Shows "development"/"local" instead of "unknown" for dev builds
- **Documentation overhaul** - All docs rewritten and condensed
  - Replaced ASCII art with D3.js interactive diagrams
  - Removed outdated CODE_REVIEW.md
  - Updated all docs to reflect current @fetch trigger system
  - Added security diagram to SETUP_GUIDE.md
- **Default model changed** - Now uses `openai/gpt-4o-mini` (was invalid `gpt-4.1-nano`)
- Status API port changed from 3001 to **8765** (avoid conflicts with Next.js/Loki)
- Security gate completely rewritten for @fetch trigger support
- Bridge client updated to pass participant ID for group message verification
- Improved startup logging with clear initialization sections

### Fixed
- Group messages now properly supported with owner verification
- **Self-chat messages** - Now properly received when messaging yourself
- Chromium profile lock handling improved with clearer error messages

## [0.1.0] - 2026-02-01

### Added
- Initial release of Fetch - Your Faithful Code Companion
- WhatsApp bridge using `whatsapp-web.js` for messaging interface
- Go TUI Manager with Bubble Tea framework for service management
- Agentic framework powered by GPT-4.1-nano via OpenRouter
- 24 built-in tools for file, code, shell, git, and control operations
- ReAct (Reason + Act) loop for multi-step autonomous tasks
- Session memory with persistent conversation context
- Configurable autonomy modes: Supervised, Semi-autonomous, Fully autonomous
- Docker-based architecture with Bridge and Kennel containers
- Multi-agent support: Claude Code, Gemini CLI, GitHub Copilot
- Security features:
  - Whitelist-only authentication (OWNER_PHONE_NUMBER)
  - Rate limiting (30 requests/minute)
  - Input validation and sanitization
  - Docker isolation for command execution
  - Output sanitization (ANSI stripping, length truncation)

### Changed
- Generalized platform support from Raspberry Pi-specific to any Linux machine (ARM64/x86_64)
- Renamed `install-pi.sh` to `install.sh` for broader compatibility
- Updated all documentation to remove Raspberry Pi-specific references
- Improved QR code display in TUI and bridge client with better formatting

### Security
- Added beta warning to README emphasizing experimental nature
- All CLI commands use array-based argument passing (no shell injection possible)
- Read-only config mounts for authentication tokens
- Silent drop of unauthorized messages (no acknowledgment)

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2026-02-01 | Initial beta release |

[Unreleased]: https://github.com/Traves-Theberge/Fetch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Traves-Theberge/Fetch/releases/tag/v0.1.0
