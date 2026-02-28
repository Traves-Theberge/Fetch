// Package components provides a spinner component for loading states.
package components

import (
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// SpinnerType defines different spinner animation styles
type SpinnerType int

const (
	SpinnerDot SpinnerType = iota
	SpinnerLine
	SpinnerMiniDot
	SpinnerJump
	SpinnerPulse
	SpinnerPoints
	SpinnerGlobe
	SpinnerMoon
	SpinnerMonkey
)

// Spinner wraps bubbles spinner with Fetch styling
type Spinner struct {
	spinner spinner.Model
	label   string
	style   lipgloss.Style
}

// NewSpinner creates a new styled spinner
func NewSpinner(spinnerType SpinnerType, label string) *Spinner {
	s := spinner.New()

	// Set spinner style based on type
	switch spinnerType {
	case SpinnerLine:
		s.Spinner = spinner.Line
	case SpinnerMiniDot:
		s.Spinner = spinner.MiniDot
	case SpinnerJump:
		s.Spinner = spinner.Jump
	case SpinnerPulse:
		s.Spinner = spinner.Pulse
	case SpinnerPoints:
		s.Spinner = spinner.Points
	case SpinnerGlobe:
		s.Spinner = spinner.Globe
	case SpinnerMoon:
		s.Spinner = spinner.Moon
	case SpinnerMonkey:
		s.Spinner = spinner.Monkey
	default:
		s.Spinner = spinner.Dot
	}

	s.Style = lipgloss.NewStyle().Foreground(theme.Primary)

	return &Spinner{
		spinner: s,
		label:   label,
		style: lipgloss.NewStyle().
			Foreground(theme.TextSecondary).
			MarginLeft(1),
	}
}

// Init initializes the spinner
func (s *Spinner) Init() tea.Cmd {
	return s.spinner.Tick
}

// Update handles spinner updates
func (s *Spinner) Update(msg tea.Msg) (*Spinner, tea.Cmd) {
	var cmd tea.Cmd
	s.spinner, cmd = s.spinner.Update(msg)
	return s, cmd
}

// View renders the spinner with label
func (s *Spinner) View() string {
	return s.spinner.View() + s.style.Render(s.label)
}

// SetLabel updates the spinner label
func (s *Spinner) SetLabel(label string) {
	s.label = label
}

// Loading renders a simple loading indicator (static, no state needed)
func Loading(message string) string {
	spinnerStyle := lipgloss.NewStyle().Foreground(theme.Primary)
	labelStyle := lipgloss.NewStyle().Foreground(theme.TextSecondary).MarginLeft(1)

	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	// Use first frame for static display
	return spinnerStyle.Render(frames[0]) + labelStyle.Render(message)
}

// LoadingDots renders animated dots (for text-only contexts)
func LoadingDots(message string, tick int) string {
	dots := []string{"", ".", "..", "..."}
	return message + dots[tick%4]
}
