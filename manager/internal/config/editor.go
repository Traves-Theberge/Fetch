// Package config provides a TUI-based configuration editor for Fetch.
package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/fetch/manager/internal/paths"
)

var (
	labelStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			Width(25)

	inputStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF6B35"))

	focusedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00ff00")).
			Bold(true)

	helpTextStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#626262")).
			Italic(true)

	separatorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF6B35")).
			Bold(true)

	defaultStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#555555")).
			Italic(true)
)

// ConfigField represents a single configuration field
type ConfigField struct {
	Key         string
	Value       string
	Default     string // Default value shown when empty
	Label       string
	Help        string
	Masked      bool
	IsSeparator bool // Renders as section header, not editable
}

// Editor handles the configuration editing UI
type Editor struct {
	fields              []ConfigField
	cursor              int
	editing             bool
	editBuffer          string
	saved               bool
	errorMessage        string
	scrollOffset        int // viewport scroll offset
	viewHeight          int // max visible rows
	modelPickerRequested bool // signals parent to open model picker
}

// ModelPickerRequested returns true if the user pressed Enter on the Agent Model field
func (e *Editor) ModelPickerRequested() bool {
	return e.modelPickerRequested
}

// ClearModelPickerRequest resets the model picker flag
func (e *Editor) ClearModelPickerRequest() {
	e.modelPickerRequested = false
}

// SetFieldValue sets the value of a field by key
func (e *Editor) SetFieldValue(key, value string) {
	for i := range e.fields {
		if e.fields[i].Key == key {
			e.fields[i].Value = value
			return
		}
	}
}

// NewEditor creates a new configuration editor
func NewEditor() *Editor {
	editor := &Editor{
		fields: []ConfigField{
			// ─── Core Settings ───────────────────────────────────────
			{IsSeparator: true, Label: "─── Core Settings ───"},
			{Key: "OWNER_PHONE_NUMBER", Label: "Owner Phone", Help: "Your WhatsApp number (e.g., 15551234567)"},
			{Key: "OPENROUTER_API_KEY", Label: "OpenRouter Key", Help: "API key from openrouter.ai", Masked: true},
			{Key: "ENABLE_COPILOT", Label: "Enable Copilot", Help: "Enable GitHub Copilot harness", Default: "false"},
			{Key: "ENABLE_CLAUDE", Label: "Enable Claude", Help: "Enable Claude Code harness", Default: "false"},
			{Key: "ENABLE_GEMINI", Label: "Enable Gemini", Help: "Enable Gemini harness", Default: "false"},
			{Key: "AGENT_MODEL", Label: "Agent Model", Help: "OpenRouter model ID", Default: "openai/gpt-4o-mini"},
			{Key: "LOG_LEVEL", Label: "Log Level", Help: "debug, info, warn, error", Default: "info"},
			{Key: "TZ", Label: "Timezone", Help: "IANA timezone", Default: "UTC"},
			// ─── Context Window ──────────────────────────────────────
			{IsSeparator: true, Label: "─── Context Window ───"},
			{Key: "FETCH_HISTORY_WINDOW", Label: "History Window", Help: "Messages in sliding window", Default: "20"},
			{Key: "FETCH_COMPACTION_THRESHOLD", Label: "Compaction Threshold", Help: "Compact when messages exceed this", Default: "40"},
			{Key: "FETCH_COMPACTION_MAX_TOKENS", Label: "Compaction Max Tokens", Help: "Max tokens for compaction summary", Default: "500"},
			{Key: "FETCH_COMPACTION_MODEL", Label: "Compaction Model", Help: "Model for summaries", Default: "openai/gpt-4o-mini"},
			// ─── Agent LLM ───────────────────────────────────────────
			{IsSeparator: true, Label: "─── Agent LLM ───"},
			{Key: "FETCH_MAX_TOOL_CALLS", Label: "Max Tool Calls", Help: "Tool call rounds per message", Default: "5"},
			{Key: "FETCH_CHAT_MAX_TOKENS", Label: "Chat Max Tokens", Help: "Token budget for chat responses", Default: "300"},
			{Key: "FETCH_CHAT_TEMPERATURE", Label: "Chat Temperature", Help: "LLM creativity 0.0-1.0", Default: "0.7"},
			{Key: "FETCH_TOOL_MAX_TOKENS", Label: "Tool Max Tokens", Help: "Token budget for tool responses", Default: "500"},
			{Key: "FETCH_TOOL_TEMPERATURE", Label: "Tool Temperature", Help: "LLM precision 0.0-1.0", Default: "0.3"},
			{Key: "FETCH_FRAME_MAX_TOKENS", Label: "Frame Max Tokens", Help: "Token budget for task framing", Default: "200"},
			// ─── Circuit Breaker ─────────────────────────────────────
			{IsSeparator: true, Label: "─── Circuit Breaker ───"},
			{Key: "FETCH_CB_THRESHOLD", Label: "CB Threshold", Help: "Errors before circuit opens", Default: "3"},
			{Key: "FETCH_CB_BACKOFF", Label: "CB Backoff (ms)", Help: "Backoff schedule, comma-separated", Default: "1000,5000,30000"},
			{Key: "FETCH_MAX_RETRIES", Label: "Max Retries", Help: "Max retries for retriable errors", Default: "3"},
			{Key: "FETCH_RETRY_BACKOFF", Label: "Retry Backoff (ms)", Help: "Retry schedule, comma-separated", Default: "0,1000,3000,10000"},
			{Key: "FETCH_CB_RESET_MS", Label: "CB Reset (ms)", Help: "Reset error count after quiet period", Default: "300000"},
			// ─── Task Execution ──────────────────────────────────────
			{IsSeparator: true, Label: "─── Task Execution ───"},
			{Key: "FETCH_TASK_TIMEOUT", Label: "Task Timeout (ms)", Help: "Task execution timeout", Default: "300000"},
			{Key: "FETCH_HARNESS_TIMEOUT", Label: "Harness Timeout (ms)", Help: "AI harness timeout", Default: "300000"},
			{Key: "FETCH_TASK_MAX_RETRIES", Label: "Task Max Retries", Help: "Max task retries", Default: "1"},
			// ─── WhatsApp Formatting ─────────────────────────────────
			{IsSeparator: true, Label: "─── WhatsApp Formatting ───"},
			{Key: "FETCH_WA_MAX_LENGTH", Label: "WA Max Length", Help: "Max chars per WhatsApp message", Default: "4000"},
			{Key: "FETCH_WA_LINE_WIDTH", Label: "WA Line Width", Help: "Max chars per line for readability", Default: "40"},
			// ─── Rate Limiting ───────────────────────────────────────
			{IsSeparator: true, Label: "─── Rate Limiting ───"},
			{Key: "FETCH_RATE_LIMIT_MAX", Label: "Rate Limit Max", Help: "Requests per window", Default: "30"},
			{Key: "FETCH_RATE_LIMIT_WINDOW", Label: "Rate Limit Window (ms)", Help: "Rate limit window duration", Default: "60000"},
			// ─── Bridge / Reconnection ───────────────────────────────
			{IsSeparator: true, Label: "─── Bridge / Reconnection ───"},
			{Key: "FETCH_MAX_RECONNECT", Label: "Max Reconnect", Help: "Max reconnect attempts", Default: "10"},
			{Key: "FETCH_RECONNECT_BASE_DELAY", Label: "Reconnect Base (ms)", Help: "Base delay for exponential backoff", Default: "5000"},
			{Key: "FETCH_RECONNECT_MAX_DELAY", Label: "Reconnect Max (ms)", Help: "Max delay cap for reconnect", Default: "300000"},
			{Key: "FETCH_RECONNECT_JITTER", Label: "Reconnect Jitter (ms)", Help: "Max jitter added to delay", Default: "2000"},
			{Key: "FETCH_DEDUP_TTL", Label: "Dedup TTL (ms)", Help: "Message deduplication cache TTL", Default: "30000"},
			{Key: "FETCH_PROGRESS_THROTTLE", Label: "Progress Throttle (ms)", Help: "Throttle interval for progress updates", Default: "3000"},
			// ─── Session / Memory ────────────────────────────────────
			{IsSeparator: true, Label: "─── Session / Memory ───"},
			{Key: "FETCH_RECENT_MSG_LIMIT", Label: "Recent Msg Limit", Help: "Default recent messages limit", Default: "50"},
			{Key: "FETCH_TRUNCATION_LIMIT", Label: "Truncation Limit", Help: "Max messages before hard truncation", Default: "100"},
			{Key: "FETCH_REPO_MAP_TTL", Label: "Repo Map TTL (ms)", Help: "Repo map staleness check interval", Default: "300000"},
			// ─── Workspace ───────────────────────────────────────────
			{IsSeparator: true, Label: "─── Workspace ───"},
			{Key: "FETCH_WORKSPACE_CACHE_TTL", Label: "Workspace Cache (ms)", Help: "Workspace info cache TTL", Default: "30000"},
			{Key: "FETCH_GIT_TIMEOUT", Label: "Git Timeout (ms)", Help: "Git command execution timeout", Default: "5000"},
			// ─── BM25 Memory ─────────────────────────────────────────
			{IsSeparator: true, Label: "─── BM25 Memory ───"},
			{Key: "FETCH_RECALL_LIMIT", Label: "Recall Limit", Help: "Max recalled results injected into context", Default: "5"},
			{Key: "FETCH_RECALL_SNIPPET_TOKENS", Label: "Recall Snippet Tokens", Help: "Max tokens per recalled snippet", Default: "300"},
			{Key: "FETCH_RECALL_DECAY", Label: "Recall Decay", Help: "Recency decay factor, higher=faster", Default: "0.1"},
		},
	}
	editor.loadFromFile()
	return editor
}

// loadFromFile loads current values from .env file.
func (e *Editor) loadFromFile() {
	file, err := os.Open(paths.EnvFile)
	if err != nil {
		// File doesn't exist, that's okay
		return
	}
	defer file.Close()

	envMap := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}

	for i := range e.fields {
		if val, ok := envMap[e.fields[i].Key]; ok {
			e.fields[i].Value = val
		}
	}
}

// saveToFile writes configuration to .env file, preserving unknown fields,
// comments, and blank lines. Only updates values for fields the editor manages.
func (e *Editor) saveToFile() error {
	// Build map of editor-managed keys
	editorValues := make(map[string]string)
	for _, field := range e.fields {
		editorValues[field.Key] = field.Value
	}

	// Read existing file content
	existingContent, readErr := os.ReadFile(paths.EnvFile)

	var outputLines []string
	writtenKeys := make(map[string]bool)

	if readErr == nil && len(existingContent) > 0 {
		lines := strings.Split(string(existingContent), "\n")
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)

			// Preserve comments and blank lines as-is
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				outputLines = append(outputLines, line)
				continue
			}

			// Parse KEY=VALUE
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) != 2 {
				// Malformed line — preserve as-is
				outputLines = append(outputLines, line)
				continue
			}

			key := strings.TrimSpace(parts[0])
			if val, managed := editorValues[key]; managed {
				// Editor-managed key — write updated value
				outputLines = append(outputLines, key+"="+val)
				writtenKeys[key] = true
			} else {
				// Unknown key — preserve original line exactly
				outputLines = append(outputLines, line)
			}
		}
	} else {
		// File doesn't exist — write a header
		outputLines = append(outputLines, "# Fetch Configuration")
		outputLines = append(outputLines, "# Managed by Fetch Manager")
		outputLines = append(outputLines, "")
	}

	// Append any editor-managed keys not already in the file
	for _, field := range e.fields {
		if field.IsSeparator {
			continue
		}
		if !writtenKeys[field.Key] && field.Value != "" {
			outputLines = append(outputLines, field.Key+"="+field.Value)
		}
	}

	// Join and ensure single trailing newline
	output := strings.Join(outputLines, "\n")
	output = strings.TrimRight(output, "\n") + "\n"

	return os.WriteFile(paths.EnvFile, []byte(output), 0644)
}

// SetSize sets the available viewport height for scrolling
func (e *Editor) SetSize(height int) {
	// Reserve lines for status messages, padding
	e.viewHeight = height - 6
	if e.viewHeight < 10 {
		e.viewHeight = 10
	}
}

// ensureVisible adjusts scroll offset so cursor is visible
func (e *Editor) ensureVisible() {
	if e.viewHeight <= 0 {
		return
	}
	// Each field takes ~1 line, separators ~2, focused field ~2 (with help)
	// Use a simple line-per-field estimate
	if e.cursor < e.scrollOffset {
		e.scrollOffset = e.cursor
	}
	if e.cursor >= e.scrollOffset+e.viewHeight {
		e.scrollOffset = e.cursor - e.viewHeight + 1
	}
	if e.scrollOffset < 0 {
		e.scrollOffset = 0
	}
}

// Update handles keyboard input
func (e *Editor) Update(msg tea.KeyMsg) {
	if e.editing {
		switch msg.String() {
		case "enter":
			e.fields[e.cursor].Value = e.editBuffer
			e.editing = false
		case "esc":
			e.editing = false
		case "backspace":
			if len(e.editBuffer) > 0 {
				e.editBuffer = e.editBuffer[:len(e.editBuffer)-1]
			}
		default:
			if len(msg.String()) == 1 {
				e.editBuffer += msg.String()
			}
		}
		return
	}

	switch msg.String() {
	case "up", "k":
		for i := e.cursor - 1; i >= 0; i-- {
			if !e.fields[i].IsSeparator {
				e.cursor = i
				break
			}
		}
		e.ensureVisible()
	case "down", "j":
		for i := e.cursor + 1; i < len(e.fields); i++ {
			if !e.fields[i].IsSeparator {
				e.cursor = i
				break
			}
		}
		e.ensureVisible()
	case "enter", "e":
		if !e.fields[e.cursor].IsSeparator {
			// AGENT_MODEL opens the model picker overlay
			if e.fields[e.cursor].Key == "AGENT_MODEL" {
				e.modelPickerRequested = true
				return
			}
			e.editing = true
			e.editBuffer = e.fields[e.cursor].Value
		}
	case "s":
		err := e.saveToFile()
		if err != nil {
			e.errorMessage = "Failed to save: " + err.Error()
		} else {
			e.saved = true
			e.errorMessage = ""
		}
	}
}

// View renders the configuration editor
func (e *Editor) View() string {
	s := ""

	// Determine visible range
	startIdx := 0
	endIdx := len(e.fields)
	if e.viewHeight > 0 && len(e.fields) > e.viewHeight {
		startIdx = e.scrollOffset
		endIdx = e.scrollOffset + e.viewHeight
		if endIdx > len(e.fields) {
			endIdx = len(e.fields)
		}
	}

	// Scroll indicator at top
	if startIdx > 0 {
		s += helpTextStyle.Render("   ▲ scroll up for more") + "\n"
	}

	for i := startIdx; i < endIdx; i++ {
		field := e.fields[i]
		// Render separator as section header
		if field.IsSeparator {
			s += "\n" + separatorStyle.Render("   "+field.Label) + "\n"
			continue
		}

		label := labelStyle.Render(field.Label + ":")

		value := field.Value
		if field.Masked && value != "" && !e.editing {
			value = strings.Repeat("•", min(len(value), 20))
		}

		// Show default when value is empty
		displayValue := value
		showingDefault := false
		if displayValue == "" && field.Default != "" {
			displayValue = field.Default
			showingDefault = true
		}

		if i == e.cursor {
			if e.editing {
				// Show edit buffer with cursor
				s += focusedStyle.Render("▶ ") + label + " " + inputStyle.Render(e.editBuffer+"█") + "\n"
			} else if showingDefault {
				s += focusedStyle.Render("▶ ") + label + " " + defaultStyle.Render(displayValue+" (default)") + "\n"
			} else {
				s += focusedStyle.Render("▶ ") + label + " " + inputStyle.Render(displayValue) + "\n"
			}
			// Show help text for focused field
			s += "     " + helpTextStyle.Render(field.Help) + "\n"
		} else {
			if showingDefault {
				s += "   " + label + " " + defaultStyle.Render(displayValue) + "\n"
			} else {
				s += "   " + label + " " + value + "\n"
			}
		}
	}

	s += "\n"

	// Scroll indicator at bottom
	if endIdx < len(e.fields) {
		s += helpTextStyle.Render("   ▼ scroll down for more") + "\n"
	}

	// Field counter
	editableCount := 0
	for _, f := range e.fields {
		if !f.IsSeparator {
			editableCount++
		}
	}
	s += helpTextStyle.Render(fmt.Sprintf("   %d configurable parameters", editableCount)) + "\n"

	if e.saved {
		s += lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff00")).Render("   ✅ Configuration saved!") + "\n"
	}

	if e.errorMessage != "" {
		s += lipgloss.NewStyle().Foreground(lipgloss.Color("#ff0000")).Render("   ❌ "+e.errorMessage) + "\n"
	}

	return s
}
