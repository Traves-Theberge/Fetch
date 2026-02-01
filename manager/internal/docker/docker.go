// Package docker provides Docker Compose control for Fetch services.
package docker

import (
	"os/exec"
	"strings"

	"github.com/fetch/manager/internal/paths"
)

// IsContainerRunning checks if a Docker container is running.
func IsContainerRunning(name string) bool {
	cmd := exec.Command("docker", "inspect", "-f", "{{.State.Running}}", name)
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "true"
}

// StartServices starts all Fetch Docker services.
func StartServices() error {
	cmd := exec.Command("docker", "compose", "up", "-d")
	cmd.Dir = paths.ProjectDir
	return cmd.Run()
}

// StopServices stops all Fetch Docker services.
func StopServices() error {
	cmd := exec.Command("docker", "compose", "down")
	cmd.Dir = paths.ProjectDir
	return cmd.Run()
}
