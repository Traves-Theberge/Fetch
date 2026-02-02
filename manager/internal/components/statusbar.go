// Package components provides a status bar component for the Fetch TUI.
package components

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// StatusBarState holds the status bar information
type StatusBarState struct {
	BridgeRunning bool
	KennelRunning bool
	MessageCount  int
	CurrentScreen string
}

// StatusBar renders the bottom status bar
func StatusBar(state StatusBarState, width int) string {
	// Status indicators
	var statusParts []string

	// Bridge status
	if state.BridgeRunning {
		statusParts = append(statusParts,
			lipgloss.NewStyle().Foreground(theme.Success).Render("● Bridge"))
	} else {
		statusParts = append(statusParts,
			lipgloss.NewStyle().Foreground(theme.Error).Render("○ Bridge"))
	}

	// Kennel status
	if state.KennelRunning {
		statusParts = append(statusParts,
			lipgloss.NewStyle().Foreground(theme.Success).Render("● Kennel"))
	} else {
		statusParts = append(statusParts,
			lipgloss.NewStyle().Foreground(theme.Error).Render("○ Kennel"))
	}

	// Message count if any
	if state.MessageCount > 0 {
		statusParts = append(statusParts,
			lipgloss.NewStyle().
				Foreground(theme.Info).
				Render("📩 "+string(rune('0'+state.MessageCount%10))))
	}

	statusText := strings.Join(statusParts, " │ ")

	// Build the bar
	barStyle := lipgloss.NewStyle().
		Foreground(theme.TextSecondary).
		Background(theme.Surface).
		Padding(0, 2).
		Width(width)

	return barStyle.Render(statusText)
}

// HelpBar renders keyboard shortcuts
func HelpBar(shortcuts []string, width int) string {
	helpStyle := lipgloss.NewStyle().
		Foreground(theme.TextMuted).
		Background(theme.Surface).
		Padding(0, 2).
		Width(width)

	return helpStyle.Render(strings.Join(shortcuts, " │ "))
}

// CombinedStatusBar renders both status and help
func CombinedStatusBar(state StatusBarState, shortcuts []string, width int) string {
	// Top line: status
	status := StatusBar(state, width)

	// Bottom line: help
	help := HelpBar(shortcuts, width)

	// Separator
	separator := lipgloss.NewStyle().
		Foreground(theme.Border).
		Width(width).
		Render(strings.Repeat("─", width))

	return lipgloss.JoinVertical(lipgloss.Left,
		separator,
		status,
		help,
	)
}

// ActionMessage renders a success/error message
func ActionMessage(message string, success bool) string {
	if message == "" {
		return ""
	}

	style := lipgloss.NewStyle().Bold(true).Padding(0, 1)

	if success {
		return style.Foreground(theme.Success).Render("✓ " + message)
	}
	return style.Foreground(theme.Error).Render("✗ " + message)
}
