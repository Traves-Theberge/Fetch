// Package update provides git-based update functionality for Fetch.
package update

import (
	"os/exec"

	"github.com/fetch/manager/internal/paths"
)

// PullAndRebuild performs a git pull and rebuilds Docker containers.
func PullAndRebuild() error {
	gitCmd := exec.Command("git", "pull", "origin", "main")
	gitCmd.Dir = paths.ProjectDir
	if err := gitCmd.Run(); err != nil {
		return err
	}

	buildCmd := exec.Command("docker", "compose", "build")
	buildCmd.Dir = paths.ProjectDir
	return buildCmd.Run()
}
