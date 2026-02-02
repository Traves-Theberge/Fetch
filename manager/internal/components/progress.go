// Package components provides a progress bar component.
package components

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// ProgressBar renders a styled progress bar
type ProgressBar struct {
	width    int
	percent  float64
	label    string
	showPct  bool
	gradient bool
}

// NewProgressBar creates a new progress bar
func NewProgressBar(width int) *ProgressBar {
	return &ProgressBar{
		width:    width,
		percent:  0,
		showPct:  true,
		gradient: true,
	}
}

// SetPercent sets the progress percentage (0.0 to 1.0)
func (p *ProgressBar) SetPercent(pct float64) {
	if pct < 0 {
		pct = 0
	}
	if pct > 1 {
		pct = 1
	}
	p.percent = pct
}

// SetLabel sets the progress bar label
func (p *ProgressBar) SetLabel(label string) {
	p.label = label
}

// SetShowPercent toggles percentage display
func (p *ProgressBar) SetShowPercent(show bool) {
	p.showPct = show
}

// SetGradient toggles gradient coloring
func (p *ProgressBar) SetGradient(gradient bool) {
	p.gradient = gradient
}

// View renders the progress bar
func (p *ProgressBar) View() string {
	// Calculate filled width
	barWidth := p.width - 2 // Account for brackets
	if p.showPct {
		barWidth -= 5 // Account for " 100%"
	}
	if barWidth < 10 {
		barWidth = 10
	}

	filled := int(float64(barWidth) * p.percent)
	empty := barWidth - filled

	// Color selection based on progress
	var fillColor lipgloss.Color
	if p.gradient {
		if p.percent < 0.3 {
			fillColor = theme.Error
		} else if p.percent < 0.7 {
			fillColor = theme.Warning
		} else {
			fillColor = theme.Success
		}
	} else {
		fillColor = theme.Primary
	}

	// Build the bar
	filledStyle := lipgloss.NewStyle().Foreground(fillColor)
	emptyStyle := lipgloss.NewStyle().Foreground(theme.TextMuted)
	bracketStyle := lipgloss.NewStyle().Foreground(theme.Border)

	bar := bracketStyle.Render("[") +
		filledStyle.Render(strings.Repeat("█", filled)) +
		emptyStyle.Render(strings.Repeat("░", empty)) +
		bracketStyle.Render("]")

	if p.showPct {
		pctStyle := lipgloss.NewStyle().Foreground(theme.TextSecondary)
		bar += pctStyle.Render(fmt.Sprintf(" %3.0f%%", p.percent*100))
	}

	// Add label if present
	if p.label != "" {
		labelStyle := lipgloss.NewStyle().Foreground(theme.TextSecondary)
		return labelStyle.Render(p.label) + "\n" + bar
	}

	return bar
}

// SimpleProgress renders a simple inline progress bar
func SimpleProgress(percent float64, width int) string {
	if percent < 0 {
		percent = 0
	}
	if percent > 1 {
		percent = 1
	}

	filled := int(float64(width) * percent)
	empty := width - filled

	filledStyle := lipgloss.NewStyle().Foreground(theme.Primary)
	emptyStyle := lipgloss.NewStyle().Foreground(theme.TextMuted)

	return filledStyle.Render(strings.Repeat("▓", filled)) +
		emptyStyle.Render(strings.Repeat("░", empty))
}

// DownloadProgress renders a download-style progress bar with speed/ETA
func DownloadProgress(percent float64, downloaded, total string, speed string, width int) string {
	pb := NewProgressBar(width - 20)
	pb.SetPercent(percent)
	pb.SetShowPercent(false)

	infoStyle := lipgloss.NewStyle().Foreground(theme.TextSecondary)
	speedStyle := lipgloss.NewStyle().Foreground(theme.Info)

	return fmt.Sprintf("%s %s/%s %s",
		pb.View(),
		infoStyle.Render(downloaded),
		infoStyle.Render(total),
		speedStyle.Render(speed),
	)
}
