// Package layout provides framing utilities for the Fetch TUI.
package layout

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// SectionHeader creates a section header with lines
func SectionHeader(title string, width int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Secondary)

	titleText := titleStyle.Render(" " + title + " ")
	titleWidth := lipgloss.Width(titleText)

	lineWidth := (width - titleWidth) / 2
	if lineWidth < 2 {
		return titleText
	}

	lineStyle := lipgloss.NewStyle().Foreground(theme.Border)
	line := lineStyle.Render(strings.Repeat("─", lineWidth))

	return line + titleText + line
}
