// Package theme provides reusable styles for the Fetch TUI.
package theme

import "github.com/charmbracelet/lipgloss"

// ===== TEXT STYLES =====

// Title is for main screen titles
var Title = lipgloss.NewStyle().
	Bold(true).
	Foreground(Primary).
	MarginBottom(1)

// Subtitle is for secondary headings
var Subtitle = lipgloss.NewStyle().
	Foreground(TextSecondary).
	Italic(true)

// Value is for field values
var Value = lipgloss.NewStyle().
	Foreground(TextPrimary)

// ===== STATUS STYLES =====

// StatusSuccess for success messages
var StatusSuccess = lipgloss.NewStyle().
	Foreground(Success).
	Bold(true)

// StatusError for error messages
var StatusError = lipgloss.NewStyle().
	Foreground(Error).
	Bold(true)

// StatusInfo for info messages
var StatusInfo = lipgloss.NewStyle().
	Foreground(Info)

// ===== SPECIAL STYLES =====

// QRBox for displaying QR codes
var QRBox = lipgloss.NewStyle().
	Border(PanelBorder).
	BorderForeground(Primary).
	Padding(1, 2).
	Align(lipgloss.Center)

// LogLine styles for log entries
var (
	LogDebug = lipgloss.NewStyle().Foreground(TextMuted)
	LogInfo  = lipgloss.NewStyle().Foreground(Info)
	LogWarn  = lipgloss.NewStyle().Foreground(Warning)
	LogError = lipgloss.NewStyle().Foreground(Error)
)

// Category is for grouping headers (like in model selector)
var Category = lipgloss.NewStyle().
	Foreground(Secondary).
	Bold(true).
	MarginTop(1)

// Price is for cost information
var Price = lipgloss.NewStyle().
	Foreground(TextMuted)

// Current marks the currently selected/active item
var Current = lipgloss.NewStyle().
	Foreground(Warning).
	Bold(true)

// ===== EDITOR STYLES =====

// EditorLabel is for config field labels
var EditorLabel = lipgloss.NewStyle().
	Foreground(TextSecondary).
	Width(25)

// EditorInput is for config field values being edited
var EditorInput = lipgloss.NewStyle().
	Foreground(Primary)

// EditorFocused is for the focused field indicator
var EditorFocused = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#00ff00")).
	Bold(true)

// EditorHelp is for inline help text
var EditorHelp = lipgloss.NewStyle().
	Foreground(TextMuted).
	Italic(true)

// EditorSeparator is for section header separators
var EditorSeparator = lipgloss.NewStyle().
	Foreground(Primary).
	Bold(true)

// EditorDefault is for default/placeholder values
var EditorDefault = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#555555")).
	Italic(true)

// ToggleOn is for enabled boolean toggles [✓]
var ToggleOn = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#00E676")).
	Bold(true)

// ToggleOff is for disabled boolean toggles [ ]
var ToggleOff = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#666666"))

// ===== SELECTOR STYLES =====

// SelectorNormal is for unselected items in pickers
var SelectorNormal = lipgloss.NewStyle().
	Foreground(TextPrimary)

// SelectorDim is for de-emphasized items in pickers
var SelectorDim = lipgloss.NewStyle().
	Foreground(TextMuted)

// SelectorContext is for context info (e.g., context window size)
var SelectorContext = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#9B59B6"))

// SelectorModality is for modality badges
var SelectorModality = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#E67E22"))

// SelectorToolsBadge is for tool support indicators
var SelectorToolsBadge = lipgloss.NewStyle().
	Foreground(Success).
	Bold(true)
