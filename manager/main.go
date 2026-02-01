// Fetch Manager - A TUI for managing Fetch services.
//
// Provides Docker Compose control, configuration editing, log viewing,
// and git-based updates through an interactive terminal interface.
package main

import (
	"fmt"
	"os"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/fetch/manager/internal/config"
	"github.com/fetch/manager/internal/docker"
	"github.com/fetch/manager/internal/logs"
	"github.com/fetch/manager/internal/status"
	"github.com/fetch/manager/internal/update"
)

// Screen represents the current TUI screen.
type screen int

const (
	screenMenu screen = iota
	screenConfig
	screenLogs
	screenStatus
	screenSetup
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

	qrBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#FF6B35")).
			Padding(1, 2)
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

type bridgeStatusMsg struct {
	status *status.BridgeStatus
	err    error
}

type tickMsg time.Time

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
	bridgeStatus  *status.BridgeStatus
	statusClient  *status.Client
}

func initialModel() model {
	return model{
		screen:       screenMenu,
		statusClient: status.NewClient(),
		choices: []string{
			"📱 Setup WhatsApp",
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

// Fetch bridge status from API
func (m model) fetchBridgeStatus() tea.Msg {
	status, err := m.statusClient.GetStatus()
	return bridgeStatusMsg{status: status, err: err}
}

// Tick for polling bridge status
func tickCmd() tea.Cmd {
	return tea.Tick(2*time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
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

	case bridgeStatusMsg:
		if msg.err == nil {
			m.bridgeStatus = msg.status
		}
		return m, nil

	case tickMsg:
		// Only poll if on setup screen
		if m.screen == screenSetup {
			return m, tea.Batch(m.fetchBridgeStatus, tickCmd())
		}
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
		case screenSetup:
			return m.updateSetup(msg)
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
		case 0: // Setup WhatsApp
			m.screen = screenSetup
			return m, tea.Batch(m.fetchBridgeStatus, tickCmd())
		case 1: // Start
			return m, startFetch
		case 2: // Stop
			return m, stopFetch
		case 3: // Configure
			m.screen = screenConfig
			m.configEditor = config.NewEditor()
			return m, nil
		case 4: // Logs
			m.screen = screenLogs
			return m, fetchLogs
		case 5: // Update
			return m, runUpdate
		case 6: // Status
			m.screen = screenStatus
			return m, checkStatus
		case 7: // Exit
			m.quitting = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) updateSetup(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	case "r":
		return m, m.fetchBridgeStatus
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
	case screenSetup:
		return m.viewSetup()
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
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    Your Faithful Code Companion
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀   
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

func (m model) viewSetup() string {
	s := "\n"
	s += titleStyle.Render("📱 WhatsApp Setup") + "\n\n"

	if m.bridgeStatus == nil {
		s += infoStyle.Render("   Connecting to Fetch Bridge...") + "\n"
		s += subtitleStyle.Render("   Make sure Fetch is running (Start Fetch from menu)") + "\n"
		s += helpStyle.Render("\n   r Refresh • Esc Back")
		return s
	}

	// Show status
	stateEmoji := m.bridgeStatus.StateEmoji()
	stateDesc := m.bridgeStatus.StateDescription()
	s += fmt.Sprintf("   Status: %s %s\n\n", stateEmoji, stateDesc)

	switch m.bridgeStatus.State {
	case "qr_pending":
		s += infoStyle.Render("   📱 Scan this QR code with WhatsApp") + "\n\n"

		if m.bridgeStatus.QRUrl != nil {
			// Show URL since terminal QR might not render well in TUI
			s += qrBoxStyle.Render(
				"OPEN THIS URL IN YOUR BROWSER:\n\n"+*m.bridgeStatus.QRUrl,
			) + "\n\n"

			s += successStyle.Render("   Tip: QR codes expire quickly - refresh if needed!") + "\n\n"
			s += subtitleStyle.Render("   Alt: docker logs fetch-bridge (shows QR in terminal)") + "\n"
		} else {
			s += subtitleStyle.Render("   QR code generating... wait a moment.") + "\n"
		}

	case "authenticated":
		s += successStyle.Render("   ✅ WhatsApp is connected and ready!") + "\n\n"
		s += fmt.Sprintf("   Uptime: %s\n", m.bridgeStatus.FormatUptime())
		s += fmt.Sprintf("   Messages: %d\n", m.bridgeStatus.MessageCount)

	case "disconnected":
		s += errorStyle.Render("   WhatsApp disconnected.") + "\n"
		if m.bridgeStatus.LastError != nil {
			s += subtitleStyle.Render(fmt.Sprintf("   Reason: %s", *m.bridgeStatus.LastError)) + "\n"
		}
		s += "\n   Try restarting Fetch to reconnect.\n"

	case "error":
		s += errorStyle.Render("   An error occurred.") + "\n"
		if m.bridgeStatus.LastError != nil {
			s += subtitleStyle.Render(fmt.Sprintf("   Error: %s", *m.bridgeStatus.LastError)) + "\n"
		}

	default:
		s += subtitleStyle.Render("   Starting up...") + "\n"
	}

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
