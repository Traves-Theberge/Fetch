# Install & Update

## Quick Install (curl)

```bash
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/Fetch/main/scripts/install.sh | bash
```

Installer behavior:
- Installs Fetch under `~/.fetch/repo`
- Creates `~/.local/bin/fetch` symlink
- Creates `.env` from `.env.example` if missing
- Resolves target release from `release-manifest.json`
- Verifies downloaded release archive with SHA-256 before install
- Builds `manager/fetch-manager` if Go is installed

## Prerequisites

Required on host:
- `git`
- `curl`
- `docker` + `docker compose` plugin

Optional:
- `go` (required for manager rebuilds)

## CLI Management

```bash
fetch self doctor
fetch self version
fetch self update
fetch self update --channel beta
fetch self pin <version>
```

Exact manifest version pin:

```bash
fetch self pin v0.0.48
```

## Service Lifecycle

```bash
fetch up
fetch status
fetch logs
fetch down
fetch tui
```

## Legacy Migration

The old root installer logic was removed. `./install.sh` now delegates to `scripts/install.sh`.

If you previously ran a repo-local install, run:

```bash
./scripts/install.sh
```

This updates symlinks and keeps your existing repo/config.

## Fork/Enterprise Override (Optional)

For forks or internal mirrors, override the repository slug used by installer/update scripts:

```bash
export FETCH_REPO_SLUG="your-org/Fetch"
curl -fsSL https://raw.githubusercontent.com/your-org/Fetch/main/scripts/install.sh | bash
```

You can also override the manifest endpoint directly:

```bash
export FETCH_MANIFEST_URL="https://raw.githubusercontent.com/your-org/Fetch/main/release-manifest.json"
fetch self update
```
