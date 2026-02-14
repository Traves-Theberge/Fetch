# Uninstall Guide

This guide removes Fetch from a host installed via `scripts/install.sh`.

## Default Uninstall (recommended)

Use the built-in CLI command:

```bash
fetch uninstall
```

This removes:
- `~/.local/bin/fetch` symlink (if present)
- `~/.fetch` install directory (`repo`, `data`, `workspace`, `config`)
- running Fetch services (best effort)

## Optional: Deep Cleanup

Remove docker artifacts, harness npm packages, and PATH profile entries:

```bash
fetch uninstall --with-docker --with-deps --clean-path
```

## Option Reference

| Option | Purpose |
|--------|---------|
| `--with-docker` | Remove Fetch containers/images/volumes |
| `--with-deps` | Remove global harness npm packages (`claude-code`, `gemini-cli`, `opencode-ai`, `codex`) |
| `--clean-path` | Remove bin-dir PATH lines from shell profiles |
| `--yes` | Non-interactive uninstall |
| `--home <path>` | Override install home path |
| `--bin-dir <path>` | Override CLI bin dir |

## Manual Docker Cleanup Only

If you only want docker cleanup without uninstalling the repo:

```bash
docker rm -f fetch-bridge fetch-kennel fetch-searxng 2>/dev/null || true
docker volume rm fetch_searxng_data 2>/dev/null || true
docker image rm fetch-bridge fetch-kennel 2>/dev/null || true
```

## Verify Removal

```bash
command -v fetch || echo "fetch removed"
test ! -d ~/.fetch && echo "~/.fetch removed"
```
