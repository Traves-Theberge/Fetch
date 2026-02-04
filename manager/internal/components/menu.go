// Package components provides reusable UI components for the Fetch TUI.
package components

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// MenuItem represents a single menu item with icon, label, and optional hotkey.
type MenuItem struct {
	Icon     string
	Label    string
	Key      string // Optional hotkey
	Disabled bool
}

// Menu is a keyboard-navigable menu component with customizable styling.
type Menu struct {
	Items    []MenuItem
	Cursor   int
	Width    int
	Title    string
	ShowKeys bool
}

// NewMenu creates a new menu
func NewMenu(title string, items []MenuItem, width int) *Menu {
	return &Menu{
		Items:    items,
		Cursor:   0,
		Width:    width,
		Title:    title,
		ShowKeys: false,
	}
}

// Up moves the cursor up
func (m *Menu) Up() {
	for i := m.Cursor - 1; i >= 0; i-- {
		if !m.Items[i].Disabled {
			m.Cursor = i
			return
		}
	}
}

// Down moves the cursor down
func (m *Menu) Down() {
	for i := m.Cursor + 1; i < len(m.Items); i++ {
		if !m.Items[i].Disabled {
			m.Cursor = i
			return
		}
	}
}

// Selected returns the currently selected item index
func (m *Menu) Selected() int {
	return m.Cursor
}

// SelectedItem returns the currently selected MenuItem
func (m *Menu) SelectedItem() MenuItem {
	if m.Cursor >= 0 && m.Cursor < len(m.Items) {
		return m.Items[m.Cursor]
	}
	return MenuItem{}
}

// View renders the menu
func (m *Menu) View() string {
	var b strings.Builder

	// Title
	if m.Title != "" {
		titleStyle := lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.Primary).
			MarginBottom(1)
		b.WriteString(titleStyle.Render(m.Title))
		b.WriteString("\n\n")
	}

	// Items
	for i, item := range m.Items {
		var line string

		if item.Disabled {
			// Disabled item
			disabledStyle := lipgloss.NewStyle().
				Foreground(theme.TextMuted).
				PaddingLeft(4)
			line = disabledStyle.Render(item.Icon + " " + item.Label)
		} else if i == m.Cursor {
			// Selected item
			selectedStyle := lipgloss.NewStyle().
				Foreground(theme.Primary).
				Bold(true)

			cursorStyle := lipgloss.NewStyle().
				Foreground(theme.Primary).
				Bold(true)

			cursor := cursorStyle.Render("▸ ")
			line = cursor + selectedStyle.Render(item.Icon+" "+item.Label)
		} else {
			// Normal item
			normalStyle := lipgloss.NewStyle().
				Foreground(theme.TextPrimary).
				PaddingLeft(2)
			line = normalStyle.Render("  " + item.Icon + " " + item.Label)
		}

		// Add hotkey if showing
		if m.ShowKeys && item.Key != "" {
			keyStyle := lipgloss.NewStyle().
				Foreground(theme.TextMuted).
				PaddingLeft(2)
			keyWidth := m.Width - lipgloss.Width(line) - 4
			if keyWidth > 0 {
				line += keyStyle.Render(strings.Repeat(" ", keyWidth) + "[" + item.Key + "]")
			}
		}

		b.WriteString(line)
		b.WriteString("\n")
	}

	// Frame the menu
	frameStyle := lipgloss.NewStyle().
		Border(theme.PanelBorder).
		BorderForeground(theme.Border).
		Padding(1, 2).
		Width(m.Width)

	return frameStyle.Render(b.String())
}

// ViewCompact renders a compact menu without frame
func (m *Menu) ViewCompact() string {
	var b strings.Builder

	for i, item := range m.Items {
		var line string

		if item.Disabled {
			disabledStyle := lipgloss.NewStyle().
				Foreground(theme.TextMuted).
				PaddingLeft(4)
			line = disabledStyle.Render(item.Icon + " " + item.Label)
		} else if i == m.Cursor {
			selectedStyle := lipgloss.NewStyle().
				Foreground(theme.Primary).
				Bold(true)
			line = selectedStyle.Render("▸ " + item.Icon + " " + item.Label)
		} else {
			normalStyle := lipgloss.NewStyle().
				Foreground(theme.TextPrimary).
				PaddingLeft(2)
			line = normalStyle.Render("  " + item.Icon + " " + item.Label)
		}

		b.WriteString(line)
		b.WriteString("\n")
	}

	return b.String()
}
