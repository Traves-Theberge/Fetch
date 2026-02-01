// Package paths provides centralized path configuration for the Fetch Manager.
// Paths can be overridden via environment variables for different deployment scenarios.
package paths

import (
	"os"
	"path/filepath"
)

var (
	// ProjectDir is the root directory of the Fetch project
	ProjectDir = getEnvOrDefault("FETCH_PROJECT_DIR", "/home/traves/Development/1. Personal/Fetch")

	// EnvFile is the path to the .env configuration file
	EnvFile = filepath.Join(ProjectDir, ".env")
)

func getEnvOrDefault(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}
