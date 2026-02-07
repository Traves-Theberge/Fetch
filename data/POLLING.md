# Polling Configuration

This file defines proactive polling tasks for Fetch.
Fetch will interpret this file and set up background intervals.

## Tasks

### Status Check
- **ID:** `status_check`
- **Interval:** 10m
- **Command:** `curl -sf http://localhost:8765/api/status`
- **Enabled:** false

### Git Pull
- **ID:** `git_sync`
- **Interval:** 15m
- **Command:** `git fetch && git status`
- **Enabled:** false
