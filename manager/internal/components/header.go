// Package components provides a header
package components

import (
	"github.com/charmbracelet/lipgloss"
	"github.com/fetch/manager/internal/theme"
)

// Header renders the application header with the Fetch logo and dog
// Returns just the ASCII dog art (without the FETCH text which was embedded)
func Header(width, height int, status string) string {
	// ASCII art dog only (for side-by-side layout with menu)
	dogArt := `⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀
⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀
⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿
⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁
⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀
⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀
⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀`

	// Smaller dog for medium terminals
	smallDogArt := `⠀⠀⠀⢀⣠⣤⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀
⠀⠀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄
⠀⠺⣇⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙
⠀⢰⡟⢷⡄⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⣾⣇⠀⠻⣄⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀
⢸⡟⠻⣆⠀⠈⠳⢄⡼⠃⠀⠀⠀⠀⠀⠀⠀⠶
⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⢠⡴⣶⣶⣒
⣿⡇⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⢠⣿⠀
⡿⠁⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⢸⣿⠀`

	logoStyle := lipgloss.NewStyle().
		Foreground(theme.Primary).
		Bold(true)

	// Choose dog size based on height
	if height < 10 {
		return logoStyle.Render(smallDogArt)
	}
	return logoStyle.Render(dogArt)
}

// CompactHeader renders a minimal header for screens with limited space
func CompactHeader(title string, width int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Primary).
		Padding(0, 1)

	borderStyle := lipgloss.NewStyle().
		Foreground(theme.Border)

	titleText := titleStyle.Render(title)
	titleWidth := lipgloss.Width(titleText)

	// Create border lines
	lineWidth := (width - titleWidth - 4) / 2
	if lineWidth < 2 {
		return titleText
	}

	line := borderStyle.Render(repeat("─", lineWidth))

	return line + titleText + line
}

// repeat repeats a string n times
func repeat(s string, n int) string {
	result := ""
	for i := 0; i < n; i++ {
		result += s
	}
	return result
}
