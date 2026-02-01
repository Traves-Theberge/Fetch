package update

import (
	"os/exec"
	"strings"
)

const projectDir = "/home/traves/Development/1. Personal/Fetch"

// PullAndRebuild performs a git pull and rebuilds Docker containers
func PullAndRebuild() error {
	// Git pull
	gitCmd := exec.Command("git", "pull", "origin", "main")
	gitCmd.Dir = projectDir
	if err := gitCmd.Run(); err != nil {
		return err
	}

	// Rebuild containers
	buildCmd := exec.Command("docker", "compose", "build")
	buildCmd.Dir = projectDir
	if err := buildCmd.Run(); err != nil {
		return err
	}

	return nil
}

// CheckForUpdates checks if there are new commits available
func CheckForUpdates() (bool, error) {
	// Fetch from remote
	fetchCmd := exec.Command("git", "fetch", "origin", "main")
	fetchCmd.Dir = projectDir
	if err := fetchCmd.Run(); err != nil {
		return false, err
	}

	// Check if local is behind remote
	statusCmd := exec.Command("git", "status", "-uno")
	statusCmd.Dir = projectDir
	output, err := statusCmd.Output()
	if err != nil {
		return false, err
	}

	// If output contains "behind", updates are available
	return strings.Contains(string(output), "behind"), nil
}