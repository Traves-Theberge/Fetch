// Package components provides reusable UI components for the Fetch Manager TUI.
package components

import (
	"fmt"
	"runtime"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// VersionInfo holds version information for the application.
type VersionInfo struct {
	Version   string
	BuildDate string
	GitCommit string
	GoVersion string
}

// DefaultVersionInfo returns default version info (can be overridden by ldflags).
func DefaultVersionInfo() VersionInfo {
	return VersionInfo{
		Version:   "v1.0.0-dev",
		BuildDate: "unknown",
		GitCommit: "unknown",
		GoVersion: runtime.Version(),
	}
}

// Version renders a Linux neofetch-style version screen with dog on left and info on right.
func Version(info VersionInfo, width int) string {
	// ASCII dog art (same as header but standalone) - 14 lines
	dogArt := `  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀`

	// Styles
	dogStyle := lipgloss.NewStyle().
		Foreground(theme.Primary)

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary)

	labelStyle := lipgloss.NewStyle().
		Foreground(theme.Primary).
		Bold(true)

	valueStyle := lipgloss.NewStyle().
		Foreground(theme.TextPrimary)

	sectionStyle := lipgloss.NewStyle().
		Foreground(theme.Secondary).
		Bold(true)

	treeStyle := lipgloss.NewStyle().
		Foreground(theme.Border)

	linkStyle := lipgloss.NewStyle().
		Foreground(theme.Info).
		Underline(true)

	// Build right-side info (needs to be 14 lines to match dog height)
	var lines []string

	// Line 1: Title
	lines = append(lines, titleStyle.Render("FETCH"))
	// Line 2: Separator
	lines = append(lines, lipgloss.NewStyle().Foreground(theme.Border).Render(strings.Repeat("─", 40)))
	// Line 3: Empty
	lines = append(lines, "")
	// Line 4: Version
	lines = append(lines, labelStyle.Render("Version")+"  "+valueStyle.Render(info.Version))
	// Line 5: Build
	buildDate := info.BuildDate
	if buildDate == "unknown" {
		buildDate = "development"
	}
	lines = append(lines, labelStyle.Render("Build")+"    "+valueStyle.Render(buildDate))
	// Line 6: Go
	lines = append(lines, labelStyle.Render("Go")+"       "+valueStyle.Render(info.GoVersion))
	// Line 7: Commit
	commit := info.GitCommit
	if commit == "unknown" {
		commit = "local"
	} else if len(commit) > 7 {
		commit = commit[:7]
	}
	lines = append(lines, labelStyle.Render("Commit")+"   "+valueStyle.Render(commit))
	// Line 8: Empty
	lines = append(lines, "")
	// Line 9: Components header
	lines = append(lines, sectionStyle.Render("Components"))
	// Line 10: Bridge
	lines = append(lines, treeStyle.Render("├─ ")+labelStyle.Render("Bridge")+"  "+valueStyle.Render("WhatsApp ↔ AI Gateway"))
	// Line 11: Kennel
	lines = append(lines, treeStyle.Render("├─ ")+labelStyle.Render("Kennel")+"  "+valueStyle.Render("Multi-Model AI Orchestrator"))
	// Line 12: Manager
	lines = append(lines, treeStyle.Render("└─ ")+labelStyle.Render("Manager")+" "+valueStyle.Render("Terminal UI"))
	// Line 13: Empty
	lines = append(lines, "")
	// Line 14: Link
	lines = append(lines, linkStyle.Render("github.com/Traves-Theberge/Fetch"))

	// Join info lines
	infoPanel := strings.Join(lines, "\n")

	// Render dog art
	dog := dogStyle.Render(dogArt)

	// Join horizontally: dog on left, info on right
	combined := lipgloss.JoinHorizontal(lipgloss.Top, dog, "    ", infoPanel)

	return combined
}

// VersionCompact renders a compact single-line version string.
func VersionCompact(info VersionInfo) string {
	commitLen := 7
	if len(info.GitCommit) < commitLen {
		commitLen = len(info.GitCommit)
	}
	return fmt.Sprintf("Fetch %s (%s)", info.Version, info.GitCommit[:commitLen])
}
