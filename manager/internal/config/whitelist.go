// Package config provides a TUI-based configuration editor for Fetch.
// This file handles the trusted numbers whitelist management.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/fetch/manager/internal/paths"
)

// WhitelistData represents the JSON structure of the whitelist file
type WhitelistData struct {
	TrustedNumbers []string `json:"trustedNumbers"`
	UpdatedAt      string   `json:"updatedAt"`
	Version        int      `json:"version"`
}

// WhitelistManager handles the trusted numbers management UI
type WhitelistManager struct {
	numbers      []string
	cursor       int
	adding       bool
	addBuffer    string
	message      string
	messageIsErr bool
}

var (
	whitelistLabelStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#888888")).
				Width(3)

	whitelistNumberStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#00BFFF"))

	whitelistFocusedStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#00ff00")).
				Bold(true)

	whitelistHelpStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#626262")).
				Italic(true)

	whitelistSuccessStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#00ff00"))

	whitelistErrorStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#ff0000"))
)

// NewWhitelistManager creates a new whitelist manager
func NewWhitelistManager() *WhitelistManager {
	wm := &WhitelistManager{}
	wm.loadFromFile()
	return wm
}

// whitelistPath returns the path to the whitelist JSON file.
// This must match the Docker volume mount: ./data:/app/data
// The bridge reads from /app/data/whitelist.json inside the container.
func whitelistPath() string {
	return filepath.Join(paths.ProjectDir, "data", "whitelist.json")
}

// loadFromFile loads trusted numbers from the JSON file
func (wm *WhitelistManager) loadFromFile() {
	wm.numbers = []string{}

	data, err := os.ReadFile(whitelistPath())
	if err != nil {
		// File doesn't exist yet, that's okay
		return
	}

	var whitelist WhitelistData
	if err := json.Unmarshal(data, &whitelist); err != nil {
		wm.message = "Failed to parse whitelist file"
		wm.messageIsErr = true
		return
	}

	wm.numbers = whitelist.TrustedNumbers
	sort.Strings(wm.numbers)
}

// saveToFile writes the whitelist to JSON file
func (wm *WhitelistManager) saveToFile() error {
	// Ensure directory exists
	dir := filepath.Dir(whitelistPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	whitelist := WhitelistData{
		TrustedNumbers: wm.numbers,
		UpdatedAt:      time.Now().Format(time.RFC3339),
		Version:        1,
	}

	data, err := json.MarshalIndent(whitelist, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(whitelistPath(), data, 0644)
}

// normalizeNumber removes non-digit characters from a phone number
func normalizeNumber(number string) string {
	var result strings.Builder
	for _, r := range number {
		if r >= '0' && r <= '9' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// addNumber adds a phone number to the whitelist
func (wm *WhitelistManager) addNumber(number string) bool {
	normalized := normalizeNumber(number)
	if len(normalized) < 10 {
		wm.message = "Number too short (need at least 10 digits)"
		wm.messageIsErr = true
		return false
	}

	// Check if already exists
	for _, n := range wm.numbers {
		if n == normalized {
			wm.message = "Number already in whitelist"
			wm.messageIsErr = true
			return false
		}
	}

	wm.numbers = append(wm.numbers, normalized)
	sort.Strings(wm.numbers)

	if err := wm.saveToFile(); err != nil {
		wm.message = "Failed to save: " + err.Error()
		wm.messageIsErr = true
		return false
	}

	wm.message = "Added +" + normalized
	wm.messageIsErr = false
	return true
}

// removeNumber removes the currently selected number
func (wm *WhitelistManager) removeNumber() bool {
	if len(wm.numbers) == 0 || wm.cursor >= len(wm.numbers) {
		return false
	}

	removed := wm.numbers[wm.cursor]
	wm.numbers = append(wm.numbers[:wm.cursor], wm.numbers[wm.cursor+1:]...)

	if wm.cursor >= len(wm.numbers) && wm.cursor > 0 {
		wm.cursor--
	}

	if err := wm.saveToFile(); err != nil {
		wm.message = "Failed to save: " + err.Error()
		wm.messageIsErr = true
		return false
	}

	wm.message = "Removed +" + removed
	wm.messageIsErr = false
	return true
}

// Update handles keyboard input
func (wm *WhitelistManager) Update(msg tea.KeyMsg) {
	if wm.adding {
		switch msg.String() {
		case "enter":
			if wm.addBuffer != "" {
				wm.addNumber(wm.addBuffer)
			}
			wm.adding = false
			wm.addBuffer = ""
		case "esc":
			wm.adding = false
			wm.addBuffer = ""
		case "backspace":
			if len(wm.addBuffer) > 0 {
				wm.addBuffer = wm.addBuffer[:len(wm.addBuffer)-1]
			}
		default:
			// Only accept digits and common phone characters
			for _, r := range msg.String() {
				if (r >= '0' && r <= '9') || r == '+' || r == '-' || r == ' ' || r == '(' || r == ')' {
					wm.addBuffer += string(r)
				}
			}
		}
		return
	}

	switch msg.String() {
	case "up", "k":
		if wm.cursor > 0 {
			wm.cursor--
		}
	case "down", "j":
		if wm.cursor < len(wm.numbers)-1 {
			wm.cursor++
		}
	case "a":
		wm.adding = true
		wm.addBuffer = ""
		wm.message = ""
	case "d", "delete", "backspace":
		wm.removeNumber()
	case "r":
		wm.loadFromFile()
		wm.message = "Refreshed from file"
		wm.messageIsErr = false
	}
}

// View renders the whitelist manager
func (wm *WhitelistManager) View() string {
	var s strings.Builder

	s.WriteString("🔐 ")
	s.WriteString(lipgloss.NewStyle().Bold(true).Render("Zero Trust Bonding - Trusted Numbers"))
	s.WriteString("\n\n")

	if wm.adding {
		s.WriteString(whitelistFocusedStyle.Render("Add number: "))
		s.WriteString(whitelistNumberStyle.Render(wm.addBuffer + "█"))
		s.WriteString("\n")
		s.WriteString(whitelistHelpStyle.Render("Enter to confirm, Esc to cancel"))
		s.WriteString("\n\n")
	}

	if len(wm.numbers) == 0 {
		s.WriteString(whitelistHelpStyle.Render("   No trusted numbers configured."))
		s.WriteString("\n")
		s.WriteString(whitelistHelpStyle.Render("   Only the owner can use @fetch."))
		s.WriteString("\n\n")
	} else {
		for i, number := range wm.numbers {
			prefix := "   "
			if i == wm.cursor && !wm.adding {
				prefix = whitelistFocusedStyle.Render("▶ ")
			}
			s.WriteString(prefix)
			s.WriteString(whitelistLabelStyle.Render(string(rune('1'+i)) + "."))
			s.WriteString(" ")
			s.WriteString(whitelistNumberStyle.Render("+" + number))
			s.WriteString("\n")
		}
		s.WriteString("\n")
	}

	// Message area
	if wm.message != "" {
		if wm.messageIsErr {
			s.WriteString(whitelistErrorStyle.Render("   ❌ " + wm.message))
		} else {
			s.WriteString(whitelistSuccessStyle.Render("   ✅ " + wm.message))
		}
		s.WriteString("\n")
	}

	// Help
	s.WriteString("\n")
	s.WriteString(whitelistHelpStyle.Render("   [a] Add  [d] Delete  [r] Refresh  [esc] Back"))
	s.WriteString("\n")
	s.WriteString(whitelistHelpStyle.Render("   Changes sync with WhatsApp /trust commands"))

	return s.String()
}

// IsAdding returns true if currently in add mode
func (wm *WhitelistManager) IsAdding() bool {
	return wm.adding
}
