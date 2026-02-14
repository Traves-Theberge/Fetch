// Package components provides reusable UI components for the Fetch TUI.
package components

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// MenuItem represents a single menu item with icon, label, and optional hotkey.
type MenuItem struct {
	Icon     string
	Label    string
	Key      string // Optional hotkey
	Badge    string // Dynamic status badge (e.g. "[Running]", "[2 accounts]")
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

// ViewCompact renders a compact menu without frame
func (m *Menu) ViewCompact() string {
	var b strings.Builder

	for i, item := range m.Items {
		var line string
		label := fmt.Sprintf("%s %s", item.Icon, item.Label)

		if item.Disabled {
			line = "   " + theme.MenuItemDisabled.Render(label)
		} else if i == m.Cursor {
			line = theme.MenuCursorPrefix.Render(" ▸ ") + theme.MenuSelectedItem.Render(label)
		} else {
			line = "   " + theme.MenuItem.Render(label)
		}

		if item.Badge != "" {
			if m.Width > 0 {
				rowWidth := m.Width - 3
				if rowWidth < 0 {
					rowWidth = 0
				}
				labelWidth := lipgloss.Width(label)
				badgeWidth := lipgloss.Width(item.Badge)
				pad := rowWidth - labelWidth - badgeWidth
				if pad < 1 {
					pad = 1
				}
				line += strings.Repeat(" ", pad) + theme.MenuItemBadge.Render(item.Badge)
			} else {
				line += " " + theme.MenuItemBadge.Render(item.Badge)
			}
		}

		b.WriteString(line)
		b.WriteString("\n")
	}

	return b.String()
}
