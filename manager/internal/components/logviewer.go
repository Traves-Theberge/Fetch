// Package components provides reusable UI components for the Fetch TUI.
package components

import (
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// LogEntry represents a single log line
type LogEntry struct {
	Timestamp time.Time
	Level     string
	Source    string
	Message   string
}

// LogViewer is a scrollable log viewer with real-time updates
type LogViewer struct {
	viewport   viewport.Model
	logs       []LogEntry
	filter     string
	autoScroll bool
	width      int
	height     int
	ready      bool
}

// NewLogViewer creates a new log viewer
func NewLogViewer(width, height int) *LogViewer {
	vp := viewport.New(width-4, height-6) // Account for frame and title
	vp.Style = lipgloss.NewStyle()

	return &LogViewer{
		viewport:   vp,
		logs:       make([]LogEntry, 0),
		autoScroll: true,
		width:      width,
		height:     height,
		ready:      true,
	}
}

// SetSize updates the viewport dimensions
func (l *LogViewer) SetSize(width, height int) {
	l.width = width
	l.height = height
	l.viewport.Width = width - 4
	l.viewport.Height = height - 6
	l.renderLogs()
}

// AddLog adds a new log entry
func (l *LogViewer) AddLog(entry LogEntry) {
	l.logs = append(l.logs, entry)
	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// AddLogs adds multiple log entries
func (l *LogViewer) AddLogs(entries []LogEntry) {
	l.logs = append(l.logs, entries...)
	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// SetLogs replaces all logs
func (l *LogViewer) SetLogs(entries []LogEntry) {
	l.logs = entries
	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// SetFilter sets a filter string for logs
func (l *LogViewer) SetFilter(filter string) {
	l.filter = strings.ToLower(filter)
	l.renderLogs()
}

// ToggleAutoScroll toggles auto-scrolling
func (l *LogViewer) ToggleAutoScroll() {
	l.autoScroll = !l.autoScroll
}

// Clear removes all logs
func (l *LogViewer) Clear() {
	l.logs = make([]LogEntry, 0)
	l.renderLogs()
}

// renderLogs renders all logs to the viewport
func (l *LogViewer) renderLogs() {
	var b strings.Builder

	for _, entry := range l.logs {
		// Apply filter
		if l.filter != "" {
			combined := strings.ToLower(entry.Message + entry.Source + entry.Level)
			if !strings.Contains(combined, l.filter) {
				continue
			}
		}

		// Format timestamp
		ts := entry.Timestamp.Format("15:04:05")

		// Style based on level
		var levelStyle lipgloss.Style
		switch strings.ToUpper(entry.Level) {
		case "DEBUG":
			levelStyle = theme.LogDebug
		case "INFO":
			levelStyle = theme.LogInfo
		case "WARN", "WARNING":
			levelStyle = theme.LogWarn
		case "ERROR", "ERR":
			levelStyle = theme.LogError
		default:
			levelStyle = lipgloss.NewStyle().Foreground(theme.TextPrimary)
		}

		// Format source
		sourceStyle := lipgloss.NewStyle().
			Foreground(theme.Secondary).
			Width(10)

		// Build line
		timestampText := lipgloss.NewStyle().
			Foreground(theme.TextMuted).
			Render(ts)

		levelText := levelStyle.
			Bold(true).
			Width(5).
			Render(strings.ToUpper(entry.Level)[:min(4, len(entry.Level))])

		sourceText := sourceStyle.Render("[" + entry.Source + "]")

		messageText := lipgloss.NewStyle().
			Foreground(theme.TextPrimary).
			Render(entry.Message)

		b.WriteString(timestampText + " " + levelText + " " + sourceText + " " + messageText + "\n")
	}

	l.viewport.SetContent(b.String())
}

// Update handles messages
func (l *LogViewer) Update(msg tea.Msg) (*LogViewer, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "a":
			l.ToggleAutoScroll()
			return l, nil
		case "c":
			l.Clear()
			return l, nil
		case "g":
			l.viewport.GotoTop()
			return l, nil
		case "G":
			l.viewport.GotoBottom()
			return l, nil
		}
	}

	l.viewport, cmd = l.viewport.Update(msg)
	return l, cmd
}

// View renders the log viewer
func (l *LogViewer) View() string {
	if !l.ready {
		return "Initializing..."
	}

	// Title bar
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary).
		Width(l.width-4).
		Padding(0, 1)

	statusText := ""
	if l.autoScroll {
		statusText = lipgloss.NewStyle().
			Foreground(theme.Success).
			Render(" ● Auto-scroll")
	} else {
		statusText = lipgloss.NewStyle().
			Foreground(theme.TextMuted).
			Render(" ○ Paused")
	}

	title := titleStyle.Render("📜 Logs" + statusText)

	// Log count
	countText := lipgloss.NewStyle().
		Foreground(theme.TextMuted).
		Render("  " + string(rune('0'+len(l.logs)%10)) + " entries")

	// Viewport
	viewportStyle := lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(theme.Border).
		Padding(0, 1).
		Width(l.width - 2).
		Height(l.height - 4)

	// Help bar
	helpText := lipgloss.NewStyle().
		Foreground(theme.TextMuted).
		Render("↑/↓: Scroll │ g/G: Top/Bottom │ a: Toggle auto-scroll │ c: Clear │ Esc: Back")

	content := lipgloss.JoinVertical(lipgloss.Left,
		title+countText,
		viewportStyle.Render(l.viewport.View()),
		helpText,
	)

	return content
}

// min returns the smaller of two ints
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
