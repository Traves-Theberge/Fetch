package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/fetch/manager/internal/config"
	"github.com/fetch/manager/internal/docker"
	"github.com/fetch/manager/internal/logs"
	"github.com/fetch/manager/internal/update"
)

// Screen types
type screen int

const (
	screenMenu screen = iota
	screenConfig
	screenLogs
	screenStatus
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FF6B35")).
			Background(lipgloss.Color("#1a1a2e")).
			Padding(1, 2).
			MarginBottom(1)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			Italic(true)

	itemStyle = lipgloss.NewStyle().
			PaddingLeft(4)

	selectedItemStyle = lipgloss.NewStyle().
				PaddingLeft(2).
				Foreground(lipgloss.Color("#FF6B35")).
				Bold(true)

	statusRunningStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#00ff00")).
				Bold(true)

	statusStoppedStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#ff0000")).
				Bold(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#626262")).
			MarginTop(2)

	successStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00ff00"))

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ff0000"))

	infoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00bfff"))
)

// Messages
type statusMsg struct {
	bridgeRunning bool
	kennelRunning bool
	err           error
}

type actionResultMsg struct {
	success bool
	message string
}

type logMsg struct {
	lines []string
}

// Model
type model struct {
	screen        screen
	choices       []string
	cursor        int
	quitting      bool
	bridgeRunning bool
	kennelRunning bool
	statusLoaded  bool
	actionMessage string
	actionSuccess bool
	logLines      []string
	configEditor  *config.Editor
	width         int
	height        int
}

func initialModel() model {
	return model{
		screen: screenMenu,
		choices: []string{
			"🚀 Start Fetch",
			"🛑 Stop Fetch",
			"⚙️  Configure",
			"📜 View Logs",
			"🔄 Update",
			"ℹ️  Status",
			"❌ Exit",
		},
	}
}

func (m model) Init() tea.Cmd {
	return checkStatus
}

// Check Docker container status
func checkStatus() tea.Msg {
	bridgeRunning := docker.IsContainerRunning("fetch-bridge")
	kennelRunning := docker.IsContainerRunning("fetch-kennel")
	return statusMsg{
		bridgeRunning: bridgeRunning,
		kennelRunning: kennelRunning,
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case statusMsg:
		m.bridgeRunning = msg.bridgeRunning
		m.kennelRunning = msg.kennelRunning
		m.statusLoaded = true
		return m, nil

	case actionResultMsg:
		m.actionMessage = msg.message
		m.actionSuccess = msg.success
		return m, checkStatus

	case logMsg:
		m.logLines = msg.lines
		return m, nil

	case tea.KeyMsg:
		// Clear action message on any key
		m.actionMessage = ""

		switch m.screen {
		case screenMenu:
			return m.updateMenu(msg)
		case screenConfig:
			return m.updateConfig(msg)
		case screenLogs:
			return m.updateLogs(msg)
		case screenStatus:
			return m.updateStatus(msg)
		}
	}

	return m, nil
}

func (m model) updateMenu(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "q":
		m.quitting = true
		return m, tea.Quit

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}

	case "down", "j":
		if m.cursor < len(m.choices)-1 {
			m.cursor++
		}

	case "enter", " ":
		switch m.cursor {
		case 0: // Start
			return m, startFetch
		case 1: // Stop
			return m, stopFetch
		case 2: // Configure
			m.screen = screenConfig
			m.configEditor = config.NewEditor()
			return m, nil
		case 3: // Logs
			m.screen = screenLogs
			return m, fetchLogs
		case 4: // Update
			return m, runUpdate
		case 5: // Status
			m.screen = screenStatus
			return m, checkStatus
		case 6: // Exit
			m.quitting = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) updateConfig(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.screen = screenMenu
		return m, nil
	}

	if m.configEditor != nil {
		m.configEditor.Update(msg)
	}

	return m, nil
}

func (m model) updateLogs(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	case "r":
		return m, fetchLogs
	}
	return m, nil
}

func (m model) updateStatus(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	case "r":
		return m, checkStatus
	}
	return m, nil
}

// Commands
func startFetch() tea.Msg {
	err := docker.StartServices()
	if err != nil {
		return actionResultMsg{success: false, message: fmt.Sprintf("Failed to start: %v", err)}
	}
	return actionResultMsg{success: true, message: "✅ Fetch services started!"}
}

func stopFetch() tea.Msg {
	err := docker.StopServices()
	if err != nil {
		return actionResultMsg{success: false, message: fmt.Sprintf("Failed to stop: %v", err)}
	}
	return actionResultMsg{success: true, message: "🛑 Fetch services stopped."}
}

func fetchLogs() tea.Msg {
	lines := logs.GetRecentLogs("fetch-bridge", 20)
	return logMsg{lines: lines}
}

func runUpdate() tea.Msg {
	err := update.PullAndRebuild()
	if err != nil {
		return actionResultMsg{success: false, message: fmt.Sprintf("Update failed: %v", err)}
	}
	return actionResultMsg{success: true, message: "🔄 Update complete! Restart to apply."}
}

func (m model) View() string {
	if m.quitting {
		return "\n  👋 Goodbye! Fetch is resting.\n\n"
	}

	switch m.screen {
	case screenConfig:
		return m.viewConfig()
	case screenLogs:
		return m.viewLogs()
	case screenStatus:
		return m.viewStatus()
	default:
		return m.viewMenu()
	}
}

func (m model) viewMenu() string {
	s := "\n"

	// ASCII Art Dog Logo
	dog := `
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    ███████╗███████╗████████╗ ██████╗██╗  ██╗
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    ██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀    █████╗  █████╗     ██║   ██║     ███████║
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿    ██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁    ██║     ███████╗   ██║   ╚██████╗██║  ██║
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀    ╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    The Loyal Dev-Retriever
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    Stay 'n Play with AI Agents
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀`

	s += lipgloss.NewStyle().Foreground(lipgloss.Color("#FF6B35")).Render(dog) + "\n\n"

	// Status indicator
	if m.statusLoaded {
		statusText := "   Status: "
		if m.bridgeRunning && m.kennelRunning {
			statusText += statusRunningStyle.Render("● Running")
		} else if m.bridgeRunning || m.kennelRunning {
			statusText += lipgloss.NewStyle().Foreground(lipgloss.Color("#ffaa00")).Render("● Partial")
		} else {
			statusText += statusStoppedStyle.Render("● Stopped")
		}
		s += statusText + "\n\n"
	}

	// Action message
	if m.actionMessage != "" {
		if m.actionSuccess {
			s += successStyle.Render("   "+m.actionMessage) + "\n\n"
		} else {
			s += errorStyle.Render("   "+m.actionMessage) + "\n\n"
		}
	}

	// Menu items
	for i, choice := range m.choices {
		cursor := "    "
		if m.cursor == i {
			cursor = "  ▶ "
			s += selectedItemStyle.Render(cursor+choice) + "\n"
		} else {
			s += itemStyle.Render(cursor+choice) + "\n"
		}
	}

	s += helpStyle.Render("\n   ↑/↓ Navigate • Enter Select • q Quit")

	return s
}

func (m model) viewConfig() string {
	s := "\n"
	s += titleStyle.Render("⚙️  Configuration") + "\n\n"

	if m.configEditor != nil {
		s += m.configEditor.View()
	}

	s += helpStyle.Render("\n   ↑/↓ Navigate • Enter Edit • s Save • Esc Back")
	return s
}

func (m model) viewLogs() string {
	s := "\n"
	s += titleStyle.Render("📜 Recent Logs") + "\n\n"

	if len(m.logLines) == 0 {
		s += infoStyle.Render("   No logs available. Is Fetch running?") + "\n"
	} else {
		for _, line := range m.logLines {
			s += "   " + line + "\n"
		}
	}

	s += helpStyle.Render("\n   r Refresh • Esc Back")
	return s
}

func (m model) viewStatus() string {
	s := "\n"
	s += titleStyle.Render("ℹ️  System Status") + "\n\n"

	// Bridge status
	bridgeStatus := statusStoppedStyle.Render("● Stopped")
	if m.bridgeRunning {
		bridgeStatus = statusRunningStyle.Render("● Running")
	}
	s += fmt.Sprintf("   Bridge (WhatsApp):  %s\n", bridgeStatus)

	// Kennel status
	kennelStatus := statusStoppedStyle.Render("● Stopped")
	if m.kennelRunning {
		kennelStatus = statusRunningStyle.Render("● Running")
	}
	s += fmt.Sprintf("   Kennel (AI Agents): %s\n", kennelStatus)

	s += helpStyle.Render("\n   r Refresh • Esc Back")
	return s
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running Fetch Manager: %v", err)
		os.Exit(1)
	}
}
