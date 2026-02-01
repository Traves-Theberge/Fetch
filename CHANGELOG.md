# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
