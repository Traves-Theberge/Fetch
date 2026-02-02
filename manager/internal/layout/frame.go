// Package layout provides framing utilities for the Fetch TUI.
package layout

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// Frame wraps content in a styled border
func Frame(content string, width int, focused bool) string {
	style := lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(theme.Border).
		Padding(1, 2).
		Width(width)

	if focused {
		style = style.BorderForeground(theme.Primary)
	}

	return style.Render(content)
}

// FrameWithTitle wraps content in a border with a title
func FrameWithTitle(title, content string, width int, focused bool) string {
	borderColor := theme.Border
	if focused {
		borderColor = theme.Primary
	}

	// Create the title bar
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary).
		Padding(0, 1)

	titleText := titleStyle.Render(title)

	// Create the frame
	frameStyle := lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(borderColor).
		Padding(1, 2).
		Width(width)

	// Render content
	framedContent := frameStyle.Render(content)

	// Insert title into top border
	lines := strings.Split(framedContent, "\n")
	if len(lines) > 0 {
		// Replace part of the top border with title
		topBorder := lines[0]
		titleWidth := lipgloss.Width(titleText)
		if titleWidth+4 < len(topBorder) {
			// Insert title after first border character
			lines[0] = string(topBorder[0]) + "─ " + title + " " + topBorder[titleWidth+4:]
		}
	}

	return strings.Join(lines, "\n")
}

// AppFrame creates the main application frame
func AppFrame(content string, width, height int) string {
	style := lipgloss.NewStyle().
		Border(theme.AppBorder).
		BorderForeground(theme.Primary).
		Padding(0, 1).
		Width(width).
		Height(height)

	return style.Render(content)
}

// HeaderBar creates a styled header bar
func HeaderBar(title string, width int) string {
	style := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.TextPrimary).
		Background(theme.Surface).
		Padding(0, 2).
		Width(width).
		Align(lipgloss.Center)

	return style.Render(title)
}

// TitleBar creates an application title bar with optional status
func TitleBar(title string, status string, width int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary).
		Padding(0, 1)

	statusStyle := lipgloss.NewStyle().
		Foreground(theme.TextSecondary).
		Padding(0, 1)

	titleText := titleStyle.Render(title)
	statusText := ""
	if status != "" {
		statusText = statusStyle.Render(status)
	}

	// Calculate spacing
	titleWidth := lipgloss.Width(titleText)
	statusWidth := lipgloss.Width(statusText)
	spacerWidth := width - titleWidth - statusWidth - 4

	spacer := ""
	if spacerWidth > 0 {
		spacer = strings.Repeat(" ", spacerWidth)
	}

	barStyle := lipgloss.NewStyle().
		Background(theme.Surface).
		Width(width).
		Padding(0, 1)

	return barStyle.Render(titleText + spacer + statusText)
}

// StatusBar creates a bottom status bar
func StatusBar(left, right string, width int) string {
	leftStyle := lipgloss.NewStyle().
		Foreground(theme.TextSecondary)

	rightStyle := lipgloss.NewStyle().
		Foreground(theme.TextMuted)

	leftText := leftStyle.Render(left)
	rightText := rightStyle.Render(right)

	// Calculate spacing
	leftWidth := lipgloss.Width(leftText)
	rightWidth := lipgloss.Width(rightText)
	spacerWidth := width - leftWidth - rightWidth - 4

	spacer := ""
	if spacerWidth > 0 {
		spacer = strings.Repeat(" ", spacerWidth)
	}

	barStyle := lipgloss.NewStyle().
		Background(theme.Surface).
		Width(width).
		Padding(0, 1)

	return barStyle.Render(leftText + spacer + rightText)
}

// Separator creates a horizontal line separator
func Separator(width int) string {
	return lipgloss.NewStyle().
		Foreground(theme.Border).
		Render(strings.Repeat("─", width))
}

// ThickSeparator creates a thicker horizontal line
func ThickSeparator(width int) string {
	return lipgloss.NewStyle().
		Foreground(theme.Border).
		Render(strings.Repeat("━", width))
}

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

// Card creates a card-style box with optional title
func Card(title, content string, width int) string {
	contentStyle := lipgloss.NewStyle().
		Padding(1, 2)

	if title != "" {
		titleBar := lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.TextPrimary).
			Background(theme.Surface).
			Padding(0, 2).
			Width(width - 2).
			Render(title)

		return lipgloss.NewStyle().
			Border(theme.PanelBorder).
			BorderForeground(theme.Border).
			Width(width).
			Render(titleBar + "\n" + contentStyle.Render(content))
	}

	return lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(theme.Border).
		Padding(1, 2).
		Width(width).
		Render(content)
}

// HelpBar creates a keyboard shortcuts bar
func HelpBar(shortcuts map[string]string, width int) string {
	style := lipgloss.NewStyle().
		Foreground(theme.TextMuted)

	keyStyle := lipgloss.NewStyle().
		Foreground(theme.TextSecondary).
		Bold(true)

	var parts []string
	for key, action := range shortcuts {
		parts = append(parts, keyStyle.Render(key)+":"+action)
	}

	return style.Render(strings.Join(parts, " │ "))
}

// ContentFrame wraps content in a simple container that respects dimensions
func ContentFrame(content string, width, height int) string {
	// Just ensure the content fits within the dimensions
	lines := strings.Split(content, "\n")

	// Truncate if too many lines
	if len(lines) > height {
		lines = lines[:height]
	}

	// Pad with empty lines if too few
	for len(lines) < height {
		lines = append(lines, "")
	}

	return strings.Join(lines, "\n")
}
