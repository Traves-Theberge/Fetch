# Uninstall Guide

This guide removes Fetch from a host installed via `scripts/install.sh`.

## Default Uninstall (recommended)

Removes the CLI symlink and installed repo/data under `~/.fetch`.

```bash
# Stop running services first (if available)
fetch down || true

# Remove CLI entrypoint
rm -f ~/.local/bin/fetch

# Remove installed home (repo, data, workspace, config)
rm -rf ~/.fetch
```

## Optional: Remove Docker Artifacts

Run this if you also want to remove Fetch containers/images/volumes:

```bash
docker rm -f fetch-bridge fetch-kennel fetch-searxng 2>/dev/null || true
docker volume rm fetch_searxng_data 2>/dev/null || true
docker image rm fetch-bridge fetch-kennel 2>/dev/null || true
```

## Optional: Remove PATH Entry

If installer added PATH lines to your shell profile, remove them:

```bash
# bash
sed -i '\|$HOME/.local/bin|d' ~/.bashrc

# zsh
sed -i '\|$HOME/.local/bin|d' ~/.zshrc

# fish
sed -i '\|fish_add_path .*\\.local/bin|d' ~/.config/fish/config.fish
```

Open a new shell after editing shell profiles.

## Verify Removal

```bash
command -v fetch || echo "fetch removed"
test ! -d ~/.fetch && echo "~/.fetch removed"
```
