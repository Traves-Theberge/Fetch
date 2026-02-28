// Package components provides common UI elements for the Fetch TUI.
package components

import (
	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// ToastKind controls toast styling and iconography.
type ToastKind string

const (
	ToastSuccess ToastKind = "success"
	ToastError   ToastKind = "error"
	ToastInfo    ToastKind = "info"
)

// Toast renders a compact, high-contrast feedback banner.
func Toast(message string, kind ToastKind) string {
	if message == "" {
		return ""
	}

	icon := "•"
	fg := theme.TextPrimary
	bg := theme.Surface

	switch kind {
	case ToastSuccess:
		icon = "✓"
		fg = theme.Success
	case ToastError:
		icon = "✗"
		fg = theme.Error
	case ToastInfo:
		icon = "i"
		fg = theme.Info
	}

	return lipgloss.NewStyle().
		Foreground(fg).
		Background(bg).
		Bold(true).
		Padding(0, 1).
		Render(icon + " " + message)
}
