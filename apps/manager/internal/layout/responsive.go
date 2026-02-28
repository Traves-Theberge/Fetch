// Package layout provides responsive layout helpers for the Fetch TUI.
package layout

// BreakpointCompact is for terminals under 60 chars wide
const BreakpointCompact = 60

// IsCompact returns true if width is below compact breakpoint
func IsCompact(width int) bool {
	return width < BreakpointCompact
}
