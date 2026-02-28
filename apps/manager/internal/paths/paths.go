// Package paths provides centralized path configuration for the Fetch Manager.
// Paths are resolved by checking FETCH_DIR, then the current working directory
// (if it looks like the Fetch project), then the executable's parent directory
// (if it looks like the project), then common install locations.
package paths

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	// ProjectDir is the root directory of the Fetch project.
	ProjectDir = resolveProjectDir()

	// EnvFile is the path to the .env configuration file.
	EnvFile = filepath.Join(ProjectDir, ".env")
)

// isFetchProject returns true if the given directory looks like the Fetch project root.
func isFetchProject(dir string) bool {
	// A valid root needs both compose + app source markers.
	// Checking .env alone is too broad (many directories may contain one).
	if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, "fetch-app")); err != nil {
		return false
	}
	return true
}

// resolveProjectDir determines the Fetch project root directory.
// Priority:
//  1. FETCH_DIR env var (explicit override)
//  2. Current working directory (if it looks like the project)
//  3. Git repo root of cwd (if it looks like the project)
//  4. Executable's parent directory (if it looks like the project)
//  5. Fallback to cwd
func resolveProjectDir() string {
	// 1. Explicit environment variable — always wins
	if dir := os.Getenv("FETCH_DIR"); dir != "" {
		return dir
	}

	// 2. Current working directory (most common: user cd's into project then runs `fetch`)
	if cwd, err := os.Getwd(); err == nil {
		if isFetchProject(cwd) {
			return cwd
		}
		// 3. Walk up to git repo root from cwd
		if root := gitRepoRoot(cwd); root != "" && isFetchProject(root) {
			return root
		}
	}

	// 4. Directory containing the running binary (works when binary is inside project)
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		if isFetchProject(exeDir) {
			return exeDir
		}
		// Installed binaries usually live under <project>/manager
		if parent := filepath.Dir(exeDir); isFetchProject(parent) {
			return parent
		}
	}

	// 5. Common install locations
	if home, err := os.UserHomeDir(); err == nil {
		for _, candidate := range []string{
			filepath.Join(home, ".fetch", "repo"),
			filepath.Join(home, "Projects", "Fetch"),
		} {
			if isFetchProject(candidate) {
				return candidate
			}
		}
	}

	// 6. Fallback to cwd
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}

	return "."
}

// gitRepoRoot returns the git repository root for a given directory, or "".
func gitRepoRoot(dir string) string {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
