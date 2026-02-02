// Package layout provides responsive layout helpers for the Fetch TUI.
package layout

import "github.com/charmbracelet/lipgloss"

// BreakpointCompact is for terminals under 60 chars wide
const BreakpointCompact = 60

// BreakpointStandard is for terminals 60-100 chars wide
const BreakpointStandard = 100

// BreakpointWide is for terminals over 100 chars wide
const BreakpointWide = 140

// Breakpoint returns the current layout breakpoint
func Breakpoint(width int) string {
	switch {
	case width < BreakpointCompact:
		return "compact"
	case width < BreakpointStandard:
		return "standard"
	case width < BreakpointWide:
		return "wide"
	default:
		return "ultrawide"
	}
}

// IsCompact returns true if width is below compact breakpoint
func IsCompact(width int) bool {
	return width < BreakpointCompact
}

// IsStandard returns true if width is in standard range
func IsStandard(width int) bool {
	return width >= BreakpointCompact && width < BreakpointStandard
}

// IsWide returns true if width is above standard breakpoint
func IsWide(width int) bool {
	return width >= BreakpointStandard
}

// ContentWidth calculates usable content width after accounting for frame
func ContentWidth(termWidth, padding int) int {
	return max(10, termWidth-padding*2-2) // -2 for borders
}

// ContentHeight calculates usable content height after accounting for chrome
func ContentHeight(termHeight, headerHeight, footerHeight int) int {
	return max(5, termHeight-headerHeight-footerHeight-2) // -2 for borders
}

// SplitHorizontal divides width into two parts based on ratio (0.0-1.0)
func SplitHorizontal(totalWidth int, leftRatio float64) (left, right int) {
	left = int(float64(totalWidth) * leftRatio)
	right = totalWidth - left - 1 // -1 for gap
	return max(10, left), max(10, right)
}

// SplitVertical divides height into two parts based on ratio (0.0-1.0)
func SplitVertical(totalHeight int, topRatio float64) (top, bottom int) {
	top = int(float64(totalHeight) * topRatio)
	bottom = totalHeight - top - 1 // -1 for gap
	return max(3, top), max(3, bottom)
}

// MenuContentSplit returns menu and content widths for current terminal
func MenuContentSplit(termWidth int) (menuWidth, contentWidth int) {
	if IsCompact(termWidth) {
		// Single column - full width
		return termWidth - 4, termWidth - 4
	}
	if IsStandard(termWidth) {
		// 35% menu, 65% content
		menuWidth = (termWidth * 35) / 100
		contentWidth = termWidth - menuWidth - 4
		return
	}
	// Wide: fixed menu at 35, flexible content
	menuWidth = 35
	contentWidth = termWidth - menuWidth - 6
	return
}

// Center horizontally centers content within the given width
func Center(content string, width int) string {
	return lipgloss.PlaceHorizontal(width, lipgloss.Center, content)
}

// CenterVertical vertically centers content within the given height
func CenterVertical(content string, height int) string {
	return lipgloss.PlaceVertical(height, lipgloss.Center, content)
}

// CenterBoth centers content both horizontally and vertically
func CenterBoth(content string, width, height int) string {
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, content)
}

// Columns joins multiple strings horizontally with optional gap
func Columns(gap int, columns ...string) string {
	if len(columns) == 0 {
		return ""
	}
	if gap > 0 {
		spacer := lipgloss.NewStyle().Width(gap).Render("")
		result := columns[0]
		for i := 1; i < len(columns); i++ {
			result = lipgloss.JoinHorizontal(lipgloss.Top, result, spacer, columns[i])
		}
		return result
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, columns...)
}

// Rows joins multiple strings vertically with optional gap
func Rows(gap int, rows ...string) string {
	if len(rows) == 0 {
		return ""
	}
	if gap > 0 {
		spacer := ""
		for i := 0; i < gap; i++ {
			spacer += "\n"
		}
		result := rows[0]
		for i := 1; i < len(rows); i++ {
			result = lipgloss.JoinVertical(lipgloss.Left, result, spacer, rows[i])
		}
		return result
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

// max returns the larger of two ints
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
