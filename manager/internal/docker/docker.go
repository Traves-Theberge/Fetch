// Package docker provides Docker Compose control for Fetch services.
package docker

import (
	"fmt"
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
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, string(output))
	}
	return nil
}

// StopServices stops all Fetch Docker services.
func StopServices() error {
	cmd := exec.Command("docker", "compose", "down")
	cmd.Dir = paths.ProjectDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, string(output))
	}
	return nil
}

// RestartBridge restarts only the bridge container with fresh auth.
func RestartBridge() error {
	// Stop bridge
	stop := exec.Command("docker", "compose", "stop", "fetch-bridge")
	stop.Dir = paths.ProjectDir
	if output, err := stop.CombinedOutput(); err != nil {
		return fmt.Errorf("stop failed: %v: %s", err, string(output))
	}

	// Remove bridge container
	rm := exec.Command("docker", "compose", "rm", "-f", "fetch-bridge")
	rm.Dir = paths.ProjectDir
	rm.CombinedOutput() // Ignore errors

	// Start bridge
	start := exec.Command("docker", "compose", "up", "-d", "fetch-bridge")
	start.Dir = paths.ProjectDir
	if output, err := start.CombinedOutput(); err != nil {
		return fmt.Errorf("start failed: %v: %s", err, string(output))
	}
	return nil
}
