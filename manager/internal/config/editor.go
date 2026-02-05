// Package config provides a TUI-based configuration editor for Fetch.
package config

import (
	"bufio"
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
)

// ConfigField represents a single configuration field
type ConfigField struct {
	Key    string
	Value  string
	Label  string
	Help   string
	Masked bool
}

// Editor handles the configuration editing UI
type Editor struct {
	fields       []ConfigField
	cursor       int
	editing      bool
	editBuffer   string
	saved        bool
	errorMessage string
}

// NewEditor creates a new configuration editor
func NewEditor() *Editor {
	editor := &Editor{
		fields: []ConfigField{
			{Key: "OWNER_PHONE_NUMBER", Label: "Owner Phone", Help: "Your WhatsApp number (e.g., 15551234567)"},
			{Key: "OPENROUTER_API_KEY", Label: "OpenRouter Key", Help: "API key from openrouter.ai", Masked: true},
			{Key: "ENABLE_COPILOT", Label: "Enable Copilot", Help: "true or false — enable GitHub Copilot harness"},
			{Key: "ENABLE_CLAUDE", Label: "Enable Claude", Help: "true or false — enable Claude Code harness"},
			{Key: "ENABLE_GEMINI", Label: "Enable Gemini", Help: "true or false — enable Gemini harness"},
			{Key: "AGENT_MODEL", Label: "Agent Model", Help: "OpenRouter model ID (e.g., openai/gpt-4o-mini)"},
			{Key: "LOG_LEVEL", Label: "Log Level", Help: "debug, info, warn, error"},
			{Key: "TZ", Label: "Timezone", Help: "IANA timezone (e.g., America/New_York, UTC)"},
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
		if !writtenKeys[field.Key] && field.Value != "" {
			outputLines = append(outputLines, field.Key+"="+field.Value)
		}
	}

	// Join and ensure single trailing newline
	output := strings.Join(outputLines, "\n")
	output = strings.TrimRight(output, "\n") + "\n"

	return os.WriteFile(paths.EnvFile, []byte(output), 0644)
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
		if e.cursor > 0 {
			e.cursor--
		}
	case "down", "j":
		if e.cursor < len(e.fields)-1 {
			e.cursor++
		}
	case "enter", "e":
		e.editing = true
		e.editBuffer = e.fields[e.cursor].Value
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

	for i, field := range e.fields {
		label := labelStyle.Render(field.Label + ":")

		value := field.Value
		if field.Masked && value != "" && !e.editing {
			value = strings.Repeat("•", min(len(value), 20))
		}

		if i == e.cursor {
			if e.editing {
				// Show edit buffer with cursor
				s += focusedStyle.Render("▶ ") + label + " " + inputStyle.Render(e.editBuffer+"█") + "\n"
			} else {
				s += focusedStyle.Render("▶ ") + label + " " + inputStyle.Render(value) + "\n"
			}
			// Show help text for focused field
			s += "     " + helpTextStyle.Render(field.Help) + "\n"
		} else {
			s += "   " + label + " " + value + "\n"
		}
	}

	s += "\n"

	if e.saved {
		s += lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff00")).Render("   ✅ Configuration saved!") + "\n"
	}

	if e.errorMessage != "" {
		s += lipgloss.NewStyle().Foreground(lipgloss.Color("#ff0000")).Render("   ❌ "+e.errorMessage) + "\n"
	}

	return s
}
