// Package theme provides a consistent design system for the Fetch TUI.
package theme

import "github.com/charmbracelet/lipgloss"

// Brand Colors
var (
	Primary   = lipgloss.Color("#FF6B35") // Fetch Orange
	Secondary = lipgloss.Color("#00BFA5") // Teal Accent
)

// Status Colors
var (
	Success = lipgloss.Color("#00E676") // Green
	Warning = lipgloss.Color("#FFD600") // Yellow
	Error   = lipgloss.Color("#FF5252") // Red
	Info    = lipgloss.Color("#448AFF") // Blue
)

// Neutral Colors
var (
	Background    = lipgloss.Color("#0D1117") // Dark background
	Surface       = lipgloss.Color("#161B22") // Card/panel background
	Border        = lipgloss.Color("#30363D") // Border color
	BorderFocused = lipgloss.Color("#58A6FF") // Focused border
	TextPrimary   = lipgloss.Color("#E6EDF3") // Primary text
	TextSecondary = lipgloss.Color("#8B949E") // Secondary/muted text
	TextMuted     = lipgloss.Color("#484F58") // Very muted text
)

// Gradient Colors (for progress bars, etc.)
var (
	GradientStart = lipgloss.Color("#FF6B35")
	GradientEnd   = lipgloss.Color("#00BFA5")
)

// AdaptiveColor returns an adaptive color that changes based on light/dark mode
func AdaptiveColor(light, dark string) lipgloss.AdaptiveColor {
	return lipgloss.AdaptiveColor{Light: light, Dark: dark}
}
