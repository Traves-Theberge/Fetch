// Package components provides reusable UI components for the Fetch TUI.
//
// This package contains all the visual building blocks for the terminal user interface,
// including the log viewer, menu, progress indicators, and other interactive elements.
package components

import (
	"fmt"
	"strings"
	"time"

	"github.com/atotto/clipboard"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// LogEntry represents a single log line with full metadata.
//
// Each log entry contains timing, severity, source, and the full message text.
// Entries are displayed with color-coded levels for quick visual scanning.
type LogEntry struct {
	Timestamp time.Time // When the log was generated
	Level     string    // DEBUG, INFO, WARN, ERROR
	Source    string    // Component that generated the log (bridge, kennel, etc.)
	Message   string    // Full log message text (not truncated)
	Raw       string    // Original raw log line for copying
}

// LogViewer is a scrollable, filterable log viewer with real-time updates.
//
// Features:
//   - Full viewport scrolling (up/down/page up/page down)
//   - Auto-scroll to follow new logs
//   - Filter by text (case-insensitive)
//   - Copy logs to clipboard
//   - Word wrapping for long messages
//   - Color-coded log levels
type LogViewer struct {
	viewport    viewport.Model
	logs        []LogEntry
	filter      string
	autoScroll  bool
	wordWrap    bool
	showRaw     bool
	width       int
	height      int
	ready       bool
	lastCopied  string
	statusMsg   string
	statusTimer int
}

// NewLogViewer creates a new log viewer with the specified dimensions.
//
// The viewer initializes with auto-scroll enabled and word wrap enabled by default.
func NewLogViewer(width, height int) *LogViewer {
	vp := viewport.New(width-4, height-8) // Account for frame, title, and help
	vp.Style = lipgloss.NewStyle()
	vp.MouseWheelEnabled = true

	return &LogViewer{
		viewport:   vp,
		logs:       make([]LogEntry, 0),
		autoScroll: true,
		wordWrap:   true,
		showRaw:    false,
		width:      width,
		height:     height,
		ready:      true,
	}
}

// SetSize updates the viewport dimensions for responsive layout.
func (l *LogViewer) SetSize(width, height int) {
	l.width = width
	l.height = height
	l.viewport.Width = width - 4
	l.viewport.Height = height - 8
	l.renderLogs()
}

// AddLog adds a new log entry and optionally scrolls to it.
func (l *LogViewer) AddLog(entry LogEntry) {
	l.logs = append(l.logs, entry)

	// Keep log buffer manageable (last 1000 entries)
	if len(l.logs) > 1000 {
		l.logs = l.logs[len(l.logs)-1000:]
	}

	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// AddLogs adds multiple log entries at once.
func (l *LogViewer) AddLogs(entries []LogEntry) {
	l.logs = append(l.logs, entries...)

	// Keep log buffer manageable
	if len(l.logs) > 1000 {
		l.logs = l.logs[len(l.logs)-1000:]
	}

	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// SetLogs replaces all logs with a new set.
func (l *LogViewer) SetLogs(entries []LogEntry) {
	l.logs = entries
	l.renderLogs()
	if l.autoScroll {
		l.viewport.GotoBottom()
	}
}

// SetFilter sets a filter string for logs (case-insensitive).
func (l *LogViewer) SetFilter(filter string) {
	l.filter = strings.ToLower(filter)
	l.renderLogs()
}

// ToggleAutoScroll toggles automatic scrolling to new logs.
func (l *LogViewer) ToggleAutoScroll() {
	l.autoScroll = !l.autoScroll
	l.setStatus("Auto-scroll: " + boolToOnOff(l.autoScroll))
}

// ToggleWordWrap toggles word wrapping for long log messages.
func (l *LogViewer) ToggleWordWrap() {
	l.wordWrap = !l.wordWrap
	l.setStatus("Word wrap: " + boolToOnOff(l.wordWrap))
	l.renderLogs()
}

// ToggleRaw toggles showing raw log lines.
func (l *LogViewer) ToggleRaw() {
	l.showRaw = !l.showRaw
	l.setStatus("Raw mode: " + boolToOnOff(l.showRaw))
	l.renderLogs()
}

// CopyAllLogs copies all visible logs to clipboard.
func (l *LogViewer) CopyAllLogs() {
	var b strings.Builder
	for _, entry := range l.logs {
		if l.matchesFilter(entry) {
			if l.showRaw && entry.Raw != "" {
				b.WriteString(entry.Raw + "\n")
			} else {
				b.WriteString(fmt.Sprintf("[%s] %s [%s] %s\n",
					entry.Timestamp.Format("15:04:05"),
					entry.Level,
					entry.Source,
					entry.Message))
			}
		}
	}

	if err := clipboard.WriteAll(b.String()); err != nil {
		l.setStatus("❌ Copy failed: " + err.Error())
	} else {
		count := strings.Count(b.String(), "\n")
		l.setStatus(fmt.Sprintf("📋 Copied %d logs to clipboard", count))
	}
}

// CopySelectedLog copies the currently visible portion to clipboard.
func (l *LogViewer) CopySelectedLog() {
	content := l.viewport.View()
	if err := clipboard.WriteAll(content); err != nil {
		l.setStatus("❌ Copy failed: " + err.Error())
	} else {
		l.setStatus("📋 Copied visible logs to clipboard")
	}
}

// Clear removes all logs.
func (l *LogViewer) Clear() {
	l.logs = make([]LogEntry, 0)
	l.renderLogs()
	l.setStatus("🗑️ Logs cleared")
}

// setStatus sets a temporary status message.
func (l *LogViewer) setStatus(msg string) {
	l.statusMsg = msg
	l.statusTimer = 30 // ~3 seconds at 10fps
}

// matchesFilter checks if an entry matches the current filter.
func (l *LogViewer) matchesFilter(entry LogEntry) bool {
	if l.filter == "" {
		return true
	}
	combined := strings.ToLower(entry.Message + entry.Source + entry.Level)
	return strings.Contains(combined, l.filter)
}

// renderLogs renders all logs to the viewport with full formatting.
//
// This method handles:
//   - Filtering by search term
//   - Color-coding by log level
//   - Word wrapping for long messages
//   - Timestamp and source formatting
func (l *LogViewer) renderLogs() {
	var b strings.Builder
	maxMsgWidth := l.width - 30 // Account for timestamp, level, source

	for _, entry := range l.logs {
		// Apply filter
		if !l.matchesFilter(entry) {
			continue
		}

		// Raw mode - show original line
		if l.showRaw && entry.Raw != "" {
			b.WriteString(entry.Raw + "\n")
			continue
		}

		// Format timestamp
		ts := entry.Timestamp.Format("15:04:05")

		// Style based on level
		var levelStyle lipgloss.Style
		var levelIcon string
		switch strings.ToUpper(entry.Level) {
		case "DEBUG":
			levelStyle = theme.LogDebug
			levelIcon = "🔍"
		case "INFO":
			levelStyle = theme.LogInfo
			levelIcon = "📘"
		case "WARN", "WARNING":
			levelStyle = theme.LogWarn
			levelIcon = "⚠️ "
		case "ERROR", "ERR":
			levelStyle = theme.LogError
			levelIcon = "❌"
		case "SUCCESS", "OK":
			levelStyle = lipgloss.NewStyle().Foreground(theme.Success)
			levelIcon = "✅"
		default:
			levelStyle = lipgloss.NewStyle().Foreground(theme.TextPrimary)
			levelIcon = "  "
		}

		// Format source
		source := entry.Source
		if len(source) > 8 {
			source = source[:8]
		}
		sourceText := lipgloss.NewStyle().
			Foreground(theme.Secondary).
			Width(8).
			Render(source)

		// Build timestamp
		timestampText := lipgloss.NewStyle().
			Foreground(theme.TextMuted).
			Render(ts)

		// Build level with icon
		levelText := levelStyle.
			Bold(true).
			Render(levelIcon)

		// Format message with word wrap if enabled
		message := entry.Message
		if l.wordWrap && len(message) > maxMsgWidth && maxMsgWidth > 20 {
			message = wrapText(message, maxMsgWidth)
		}

		messageText := lipgloss.NewStyle().
			Foreground(theme.TextPrimary).
			Render(message)

		// Build full line
		line := fmt.Sprintf("%s %s %s │ %s", timestampText, levelText, sourceText, messageText)
		b.WriteString(line + "\n")
	}

	l.viewport.SetContent(b.String())
}

// wrapText wraps text to the specified width at word boundaries.
func wrapText(text string, width int) string {
	if width <= 0 || len(text) <= width {
		return text
	}

	var result strings.Builder
	words := strings.Fields(text)
	lineLen := 0
	indent := "                         │ " // Match the log prefix width

	for i, word := range words {
		if i == 0 {
			result.WriteString(word)
			lineLen = len(word)
			continue
		}

		if lineLen+1+len(word) > width {
			result.WriteString("\n" + indent + word)
			lineLen = len(word)
		} else {
			result.WriteString(" " + word)
			lineLen += 1 + len(word)
		}
	}

	return result.String()
}

// boolToOnOff converts a boolean to "ON" or "OFF".
func boolToOnOff(b bool) string {
	if b {
		return "ON"
	}
	return "OFF"
}

// Update handles keyboard and mouse input for the log viewer.
//
// Keybindings:
//   - ↑/↓/j/k: Scroll up/down
//   - PgUp/PgDn: Page up/down
//   - g/G: Go to top/bottom
//   - a: Toggle auto-scroll
//   - w: Toggle word wrap
//   - r: Toggle raw mode
//   - c: Copy visible logs
//   - C: Copy all logs
//   - x: Clear logs
//   - Esc: Exit viewer
func (l *LogViewer) Update(msg tea.Msg) (*LogViewer, tea.Cmd) {
	var cmd tea.Cmd

	// Decrement status timer
	if l.statusTimer > 0 {
		l.statusTimer--
		if l.statusTimer == 0 {
			l.statusMsg = ""
		}
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "a":
			l.ToggleAutoScroll()
			return l, nil
		case "w":
			l.ToggleWordWrap()
			return l, nil
		case "r":
			l.ToggleRaw()
			return l, nil
		case "c":
			l.CopySelectedLog()
			return l, nil
		case "C":
			l.CopyAllLogs()
			return l, nil
		case "x":
			l.Clear()
			return l, nil
		case "g":
			l.viewport.GotoTop()
			l.autoScroll = false
			return l, nil
		case "G":
			l.viewport.GotoBottom()
			l.autoScroll = true
			return l, nil
		case "j", "down":
			l.viewport.LineDown(1)
			l.autoScroll = false
			return l, nil
		case "k", "up":
			l.viewport.LineUp(1)
			l.autoScroll = false
			return l, nil
		case "pgdown", "ctrl+d":
			l.viewport.HalfViewDown()
			l.autoScroll = false
			return l, nil
		case "pgup", "ctrl+u":
			l.viewport.HalfViewUp()
			l.autoScroll = false
			return l, nil
		}
	}

	l.viewport, cmd = l.viewport.Update(msg)
	return l, cmd
}

// View renders the log viewer with title, viewport, and help bar.
//
// The display includes:
//   - Title bar with log count and status indicators
//   - Scrollable viewport with formatted logs
//   - Help bar with keybindings
//   - Status messages for user feedback
func (l *LogViewer) View() string {
	if !l.ready {
		return "Initializing log viewer..."
	}

	// Title bar with status indicators
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary).
		Padding(0, 1)

	// Auto-scroll indicator
	scrollIndicator := ""
	if l.autoScroll {
		scrollIndicator = lipgloss.NewStyle().
			Foreground(theme.Success).
			Render(" ● LIVE")
	} else {
		scrollIndicator = lipgloss.NewStyle().
			Foreground(theme.TextMuted).
			Render(" ○ PAUSED")
	}

	// Word wrap indicator
	wrapIndicator := ""
	if l.wordWrap {
		wrapIndicator = lipgloss.NewStyle().
			Foreground(theme.Info).
			Render(" [wrap]")
	}

	// Raw mode indicator
	rawIndicator := ""
	if l.showRaw {
		rawIndicator = lipgloss.NewStyle().
			Foreground(theme.Warning).
			Render(" [raw]")
	}

	title := titleStyle.Render("📜 Fetch Logs") + scrollIndicator + wrapIndicator + rawIndicator

	// Log count and scroll position
	filteredCount := 0
	for _, entry := range l.logs {
		if l.matchesFilter(entry) {
			filteredCount++
		}
	}

	countText := lipgloss.NewStyle().
		Foreground(theme.TextMuted).
		Render(fmt.Sprintf("  %d entries", filteredCount))

	if l.filter != "" {
		countText += lipgloss.NewStyle().
			Foreground(theme.Secondary).
			Render(fmt.Sprintf(" (filter: %s)", l.filter))
	}

	// Scroll position
	scrollPos := ""
	if l.viewport.TotalLineCount() > 0 {
		pct := int(float64(l.viewport.YOffset) / float64(l.viewport.TotalLineCount()-l.viewport.Height) * 100)
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		scrollPos = lipgloss.NewStyle().
			Foreground(theme.TextMuted).
			Render(fmt.Sprintf(" │ %d%%", pct))
	}

	// Status message (temporary feedback)
	statusLine := ""
	if l.statusMsg != "" {
		statusLine = lipgloss.NewStyle().
			Foreground(theme.Success).
			Bold(true).
			Render("  " + l.statusMsg)
	}

	// Viewport with border
	viewportStyle := lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(theme.Border).
		Padding(0, 1).
		Width(l.width - 2).
		Height(l.height - 6)

	// Help bar - comprehensive keybindings
	helpStyle := lipgloss.NewStyle().
		Foreground(theme.TextMuted).
		Padding(0, 1)

	helpText := helpStyle.Render(
		"↑/↓/j/k: Scroll │ g/G: Top/Bottom │ a: Auto-scroll │ w: Wrap │ c/C: Copy │ x: Clear │ Esc: Back")

	// Combine all elements
	header := lipgloss.JoinHorizontal(lipgloss.Left, title, countText, scrollPos, statusLine)

	content := lipgloss.JoinVertical(lipgloss.Left,
		header,
		viewportStyle.Render(l.viewport.View()),
		helpText,
	)

	return content
}
