#!/bin/bash
# Kennel entrypoint - configure git/gh auth from GH_TOKEN at runtime
# The host's keyring-based token can't be shared into Docker,
# so we inject GH_TOKEN as an env var and configure git to use it.

set -e

if [ -n "$GH_TOKEN" ]; then
  # Configure gh CLI to use the token (overrides mounted hosts.yml)
  gh auth setup-git 2>/dev/null || true

  # Fetch GitHub username for git config
  GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "Fetch")
  GH_EMAIL=$(gh api user --jq '.email // empty' 2>/dev/null || echo "fetch@kennel.local")
  
  # Update git identity to match GitHub account
  git config --global user.name "$GH_USER"
  git config --global user.email "${GH_EMAIL:-fetch@kennel.local}"
  
  echo "✅ GitHub auth configured for $GH_USER"
else
  echo "⚠️  GH_TOKEN not set — workspace GitHub sync disabled"
fi

# Execute the CMD
exec "$@"
