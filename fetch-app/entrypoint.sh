#!/bin/sh
# Fetch Bridge - Container Entrypoint
#
# Cleans up stale Chromium lock files before starting the Node.js app.
# Chromium creates SingletonLock as a symlink to "hostname-pid". After an
# unclean container shutdown (crash, docker kill, OOM) the symlink persists
# on the volume mount but its target no longer exists. Chromium then refuses
# to start, thinking another instance owns the profile — causing a crash loop.
#
# This script runs BEFORE Node.js as a belt-and-suspenders safeguard.
# The Node.js bridge also cleans these in cleanupChromeLocks(), but having
# it here guarantees the container never enters a restart crash loop.

AUTH_DIR="/app/data/.wwebjs_auth"

if [ -d "$AUTH_DIR" ]; then
  find "$AUTH_DIR" -name "SingletonLock" -delete 2>/dev/null
  find "$AUTH_DIR" -name "SingletonSocket" -delete 2>/dev/null
  find "$AUTH_DIR" -name "SingletonCookie" -delete 2>/dev/null
  
  # Count what we cleaned (for logging)
  # (find -delete doesn't output, so this is best-effort)
  echo "🧹 Chromium lock cleanup complete"
fi

# Hand off to the main application
exec node dist/index.js
