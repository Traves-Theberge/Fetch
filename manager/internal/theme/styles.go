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

// Label is for form field labels
var Label = lipgloss.NewStyle().
	Foreground(TextSecondary).
	Width(20)

// Value is for field values
var Value = lipgloss.NewStyle().
	Foreground(TextPrimary)

// Muted is for hints and help text
var Muted = lipgloss.NewStyle().
	Foreground(TextMuted).
	Italic(true)

// Help is for keyboard shortcut hints
var Help = lipgloss.NewStyle().
	Foreground(TextMuted).
	MarginTop(1)

// ===== STATUS STYLES =====

// StatusSuccess for success messages
var StatusSuccess = lipgloss.NewStyle().
	Foreground(Success).
	Bold(true)

// StatusError for error messages
var StatusError = lipgloss.NewStyle().
	Foreground(Error).
	Bold(true)

// StatusWarning for warning messages
var StatusWarning = lipgloss.NewStyle().
	Foreground(Warning).
	Bold(true)

// StatusInfo for info messages
var StatusInfo = lipgloss.NewStyle().
	Foreground(Info)

// StatusRunning for running state indicator
var StatusRunning = lipgloss.NewStyle().
	Foreground(Success).
	SetString("● Running")

// StatusStopped for stopped state indicator
var StatusStopped = lipgloss.NewStyle().
	Foreground(Error).
	SetString("● Stopped")

// StatusPartial for partial state indicator
var StatusPartial = lipgloss.NewStyle().
	Foreground(Warning).
	SetString("● Partial")

// ===== MENU STYLES =====

// MenuItem is for unselected menu items
var MenuItem = lipgloss.NewStyle().
	Foreground(TextPrimary).
	PaddingLeft(2)

// MenuItemSelected is for the currently selected menu item
var MenuItemSelected = lipgloss.NewStyle().
	Foreground(Primary).
	Bold(true).
	PaddingLeft(0).
	SetString("▸ ")

// MenuItemDim is for disabled menu items
var MenuItemDim = lipgloss.NewStyle().
	Foreground(TextMuted).
	PaddingLeft(2)

// ===== PANEL STYLES =====

// Panel creates a framed panel with rounded borders
func Panel(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Border(PanelBorder).
		BorderForeground(Border).
		Padding(1, 2).
		Width(width)
}

// PanelFocused creates a focused panel with highlighted border
func PanelFocused(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Border(PanelBorder).
		BorderForeground(Primary).
		Padding(1, 2).
		Width(width)
}

// PanelWithTitle creates a panel with a title in the border
func PanelWithTitle(title string, width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Border(PanelBorder).
		BorderForeground(Border).
		BorderTop(true).
		BorderLeft(true).
		BorderRight(true).
		BorderBottom(true).
		Padding(1, 2).
		Width(width)
}

// ===== HEADER STYLES =====

// Header creates a styled header box
func Header(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Bold(true).
		Foreground(Primary).
		Background(Surface).
		Padding(0, 2).
		Width(width).
		Align(lipgloss.Center)
}

// ===== STATUS BAR STYLES =====

// StatusBar creates the bottom status bar style
func StatusBar(width int) lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(TextSecondary).
		Background(Surface).
		Padding(0, 2).
		Width(width)
}

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

// Divider creates a horizontal line
func Divider(width int) string {
	return lipgloss.NewStyle().
		Foreground(Border).
		Width(width).
		Render(repeatChar("─", width))
}

// repeatChar repeats a character n times
func repeatChar(char string, n int) string {
	result := ""
	for i := 0; i < n; i++ {
		result += char
	}
	return result
}

// ===== SPINNER STYLES =====

// Spinner style for loading indicators
var Spinner = lipgloss.NewStyle().
	Foreground(Primary)

// ===== TABLE STYLES =====

// TableHeader for table column headers
var TableHeader = lipgloss.NewStyle().
	Bold(true).
	Foreground(TextPrimary).
	BorderStyle(lipgloss.NormalBorder()).
	BorderBottom(true).
	BorderForeground(Border).
	Padding(0, 1)

// TableCell for table data cells
var TableCell = lipgloss.NewStyle().
	Foreground(TextPrimary).
	Padding(0, 1)

// TableRowSelected for selected table rows
var TableRowSelected = lipgloss.NewStyle().
	Foreground(Primary).
	Bold(true).
	Padding(0, 1)
