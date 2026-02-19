// Package docker provides Docker Compose control for Fetch services.
package docker

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

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
		outText := string(output)
		// Recover from stale containers with legacy/fixed names.
		if strings.Contains(outText, "already in use by container") &&
			(strings.Contains(outText, `container name "/fetch-`) || strings.Contains(outText, `container name "/searxng"`)) {
			cleanup := exec.Command("docker", "rm", "-f", "fetch-bridge", "fetch-kennel", "fetch-searxng", "searxng")
			cleanup.CombinedOutput() // Best-effort cleanup.

			retry := exec.Command("docker", "compose", "up", "-d")
			retry.Dir = paths.ProjectDir
			retryOutput, retryErr := retry.CombinedOutput()
			if retryErr == nil {
				return nil
			}
			return fmt.Errorf("%v: %s", retryErr, string(retryOutput))
		}
		return fmt.Errorf("%v: %s", err, string(output))
	}
	return nil
}

// StopServices stops all Fetch Docker services.
func StopServices() error {
	cmd := exec.Command("docker", "compose", "down", "--remove-orphans")
	cmd.Dir = paths.ProjectDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, string(output))
	}

	names := []string{"fetch-bridge", "fetch-kennel", "fetch-searxng"}
	deadline := time.Now().Add(15 * time.Second)
	forced := false
	for {
		running := make([]string, 0, len(names))
		for _, name := range names {
			if IsContainerRunning(name) {
				running = append(running, name)
			}
		}
		if len(running) == 0 {
			return nil
		}

		if !forced {
			// Best-effort cleanup for stale fixed-name containers.
			cleanupArgs := append([]string{"rm", "-f"}, running...)
			_ = exec.Command("docker", cleanupArgs...).Run()
			forced = true
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("containers still running after stop: %s", strings.Join(running, ", "))
		}
		time.Sleep(300 * time.Millisecond)
	}
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
