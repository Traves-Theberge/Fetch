// Package layout provides framing utilities for the Fetch TUI.
//
// ScreenLayout is the shared scaffold used by all sub-screens to eliminate
// duplicated boilerplate (default size, title, content, helpbar, spacer).
package layout

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/components"
	"github.com/fetch/manager/internal/theme"
)

// ScreenLayout is the shared scaffold for every sub-screen view.
// It standardizes the title → breadcrumb → content → helpbar pattern
// so each view*() method only needs to supply the screen-specific parts.
type ScreenLayout struct {
	Title      string   // Section header text (rendered with SectionHeader)
	Content    string   // Main body content
	HelpKeys   []string // Bottom help bar shortcuts
	Breadcrumb []string // Navigation trail, e.g. ["Main Menu", "Configure"]
	Width      int
	Height     int
}

// Render produces the final screen output with consistent spacing.
// The layout pushes content to the bottom of the terminal and
// places the help bar at the very bottom.
func (s ScreenLayout) Render() string {
	width := s.Width
	if width == 0 {
		width = 80
	}
	height := s.Height
	if height == 0 {
		height = 24
	}

	// Help bar
	helpBar := components.HelpBar(s.HelpKeys, width)
	helpHeight := lipgloss.Height(helpBar)

	// Breadcrumb bar (if set)
	breadcrumbBar := ""
	if len(s.Breadcrumb) > 0 {
		breadcrumbBar = renderBreadcrumb(s.Breadcrumb, width) + "\n"
	}

	// Title
	titleStr := ""
	if s.Title != "" {
		titleStr = SectionHeader(s.Title, width-4) + "\n"
	}

	// Assemble content area
	screenContent := breadcrumbBar + titleStr + "\n" + s.Content

	contentHeight := lipgloss.Height(screenContent)

	// Spacer at top to push content toward bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		screenContent,
		helpBar,
	)
}

// renderBreadcrumb builds a styled breadcrumb trail.
//
// Example output:  Main Menu > Configure > Agent LLM
func renderBreadcrumb(parts []string, width int) string {
	if len(parts) == 0 {
		return ""
	}

	sepStyle := lipgloss.NewStyle().Foreground(theme.TextMuted)
	itemStyle := lipgloss.NewStyle().Foreground(theme.TextSecondary)
	activeStyle := lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)

	var b strings.Builder
	b.WriteString("  ")
	for i, part := range parts {
		if i == len(parts)-1 {
			b.WriteString(activeStyle.Render(part))
		} else {
			b.WriteString(itemStyle.Render(part))
			b.WriteString(sepStyle.Render(" > "))
		}
	}

	// Ensure it doesn't exceed terminal width
	result := b.String()
	if lipgloss.Width(result) > width {
		// Truncate gracefully — just show last 2 items
		if len(parts) > 2 {
			return renderBreadcrumb(append([]string{"..."}, parts[len(parts)-2:]...), width)
		}
	}

	return result
}
