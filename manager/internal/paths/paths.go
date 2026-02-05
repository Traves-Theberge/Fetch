// Package paths provides centralized path configuration for the Fetch Manager.
// Paths are resolved by checking FETCH_DIR, then the executable's parent
// directory, then the current working directory.
package paths

import (
	"os"
	"path/filepath"
)

var (
	// ProjectDir is the root directory of the Fetch project.
	ProjectDir = resolveProjectDir()

	// EnvFile is the path to the .env configuration file.
	EnvFile = filepath.Join(ProjectDir, ".env")
)

// resolveProjectDir determines the Fetch project root directory.
// Priority: FETCH_DIR env var → executable's parent directory → cwd.
func resolveProjectDir() string {
	// 1. Explicit environment variable
	if dir := os.Getenv("FETCH_DIR"); dir != "" {
		return dir
	}

	// 2. Directory containing the running binary
	if exe, err := os.Executable(); err == nil {
		return filepath.Dir(exe)
	}

	// 3. Current working directory
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}

	return "."
}
