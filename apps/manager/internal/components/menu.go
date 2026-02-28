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
	// PinToBottom renders this item in the bottom section when
	// ViewCompactWithHeight is used.
	PinToBottom bool
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
	return m.ViewCompactWithHeight(0)
}

// ViewCompactWithHeight renders a compact menu and supports a bottom-pinned
// section when items use PinToBottom=true. If height > 0, vertical spacing
// is inserted so pinned items stay near the bottom of the menu area.
func (m *Menu) ViewCompactWithHeight(height int) string {
	type renderedLine struct {
		index int
		line  string
	}

	renderItem := func(i int, item MenuItem) string {
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

		return line
	}

	var b strings.Builder
	var topLines []renderedLine
	var bottomLines []renderedLine

	for i, item := range m.Items {
		line := renderItem(i, item)
		if item.PinToBottom {
			bottomLines = append(bottomLines, renderedLine{index: i, line: line})
		} else {
			topLines = append(topLines, renderedLine{index: i, line: line})
		}
	}

	writeLineGroup := func(lines []renderedLine) {
		for _, l := range lines {
			b.WriteString(l.line)
			b.WriteString("\n")
		}
	}

	writeLineGroup(topLines)

	if len(bottomLines) > 0 {
		if height > 0 {
			used := len(topLines) + len(bottomLines)
			gap := height - used
			for i := 0; i < gap; i++ {
				b.WriteString("\n")
			}
		}
		writeLineGroup(bottomLines)
	}

	// Legacy behavior for no pinning.
	if len(bottomLines) == 0 && len(topLines) == 0 {
		for i, item := range m.Items {
			b.WriteString(renderItem(i, item))
			b.WriteString("\n")
		}
	}

	// Keep exact trailing newline behavior from existing renderer.
	if len(m.Items) == 0 {
		b.WriteString("\n")
	}

	return b.String()
}
