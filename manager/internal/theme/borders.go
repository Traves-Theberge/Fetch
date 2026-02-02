// Package theme provides border styles for the Fetch TUI.
package theme

import "github.com/charmbracelet/lipgloss"

// Pre-defined border styles
var (
	// AppBorder is the main application frame border - double for prominence
	AppBorder = lipgloss.DoubleBorder()

	// PanelBorder is for content panels - rounded for softer look
	PanelBorder = lipgloss.RoundedBorder()

	// TableBorder is for tables and lists - normal for structure
	TableBorder = lipgloss.NormalBorder()

	// ThickBorder is for emphasis - headers, important sections
	ThickBorder = lipgloss.ThickBorder()
)

// Custom ASCII art borders for special cases
var (
	// FetchBorder is a custom border with Fetch branding
	FetchBorder = lipgloss.Border{
		Top:         "─",
		Bottom:      "─",
		Left:        "│",
		Right:       "│",
		TopLeft:     "╭",
		TopRight:    "╮",
		BottomLeft:  "╰",
		BottomRight: "╯",
	}

	// DashedBorder for secondary elements
	DashedBorder = lipgloss.Border{
		Top:         "╌",
		Bottom:      "╌",
		Left:        "╎",
		Right:       "╎",
		TopLeft:     "┌",
		TopRight:    "┐",
		BottomLeft:  "└",
		BottomRight: "┘",
	}

	// BlockBorder for terminal/code sections
	CodeBorder = lipgloss.Border{
		Top:         "▄",
		Bottom:      "▀",
		Left:        "█",
		Right:       "█",
		TopLeft:     "▄",
		TopRight:    "▄",
		BottomLeft:  "▀",
		BottomRight: "▀",
	}
)

// HeaderBorder creates a border suitable for section headers
var HeaderBorder = lipgloss.Border{
	Top:         "━",
	Bottom:      "─",
	Left:        "┃",
	Right:       "┃",
	TopLeft:     "┏",
	TopRight:    "┓",
	BottomLeft:  "┠",
	BottomRight: "┨",
}

// StatusBarBorder for the bottom status bar
var StatusBarBorder = lipgloss.Border{
	Top:         "─",
	Bottom:      "━",
	Left:        "│",
	Right:       "│",
	TopLeft:     "├",
	TopRight:    "┤",
	BottomLeft:  "┗",
	BottomRight: "┛",
}
