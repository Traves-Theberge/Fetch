// Fetch Manager - A TUI for managing Fetch services.
//
// Provides Docker Compose control, configuration editing, log viewing,
// and git-based updates through an interactive terminal interface.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/fetch/manager/internal/components"
	"github.com/fetch/manager/internal/config"
	"github.com/fetch/manager/internal/docker"
	"github.com/fetch/manager/internal/layout"
	"github.com/fetch/manager/internal/logs"
	"github.com/fetch/manager/internal/models"
	"github.com/fetch/manager/internal/status"
	"github.com/fetch/manager/internal/theme"
	"github.com/fetch/manager/internal/update"
)

// Style aliases - mapping legacy names to theme package
var (
	titleStyle         = theme.Title
	subtitleStyle      = theme.Subtitle
	helpStyle          = theme.Help
	infoStyle          = theme.StatusInfo
	successStyle       = theme.StatusSuccess
	errorStyle         = theme.StatusError
	statusRunningStyle = theme.StatusRunning
	statusStoppedStyle = theme.StatusStopped
	itemStyle          = theme.MenuItem
	selectedItemStyle  = theme.MenuItemSelected
	qrBoxStyle         = theme.QRBox
)

// Screen represents the current TUI screen.
type screen int

const (
	screenSplash screen = iota
	screenMenu
	screenConfig
	screenLogs
	screenStatus
	screenSetup
	screenModels
	screenVersion
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

// splashDoneMsg signals splash screen timeout
type splashDoneMsg struct{}

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
	modelSelector *models.Selector
	width         int
	height        int
	bridgeStatus  *status.BridgeStatus
	statusClient  *status.Client
	versionInfo   components.VersionInfo
}

func initialModel() model {
	return model{
		screen:       screenSplash,
		statusClient: status.NewClient(),
		versionInfo:  components.DefaultVersionInfo(),
		choices: []string{
			"📱 Setup WhatsApp",
			"🚀 Start Fetch",
			"🛑 Stop Fetch",
			"⚙️  Configure",
			"🤖 Select Model",
			"📜 View Logs",
			"📚 Documentation",
			"ℹ️  Version",
			"❌ Exit",
		},
	}
}

func (m model) Init() tea.Cmd {
	// Show splash for 2 seconds, then check status
	return tea.Batch(
		tea.Tick(2*time.Second, func(t time.Time) tea.Msg {
			return splashDoneMsg{}
		}),
		checkStatus,
	)
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

	case splashDoneMsg:
		m.screen = screenMenu
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

	case models.ModelsLoadedMsg:
		if m.modelSelector != nil {
			m.modelSelector, _ = m.modelSelector.Update(msg)
		}
		return m, nil

	case models.ModelSavedMsg:
		if m.modelSelector != nil {
			m.modelSelector, _ = m.modelSelector.Update(msg)
		}
		return m, nil

	case tickMsg:
		// Only poll if on setup screen
		if m.screen == screenSetup {
			return m, tea.Batch(m.fetchBridgeStatus, tickCmd())
		}
		return m, nil

	case tea.KeyMsg:
		// Allow skipping splash with any key
		if m.screen == screenSplash {
			m.screen = screenMenu
			return m, nil
		}

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
		case screenModels:
			return m.updateModels(msg)
		case screenVersion:
			return m.updateVersion(msg)
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
		case 4: // Select Model
			m.screen = screenModels
			m.modelSelector = models.NewSelector()
			return m, models.FetchModelsCmd
		case 5: // Logs
			m.screen = screenLogs
			return m, fetchLogs
		case 6: // Documentation
			return m, openDocs
		case 7: // Version
			m.screen = screenVersion
			return m, nil
		case 8: // Exit
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
	case "o":
		// Open QR URL in browser
		if m.bridgeStatus != nil && m.bridgeStatus.QRUrl != nil {
			exec.Command("xdg-open", *m.bridgeStatus.QRUrl).Start()
		}
		return m, nil
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

func (m model) updateModels(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	}

	if m.modelSelector != nil {
		var cmd tea.Cmd
		m.modelSelector, cmd = m.modelSelector.Update(msg)
		return m, cmd
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

func (m model) updateVersion(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
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

func openDocs() tea.Msg {
	docsURL := "http://localhost:8765/docs"
	err := exec.Command("xdg-open", docsURL).Start()
	if err != nil {
		return actionResultMsg{success: false, message: fmt.Sprintf("Failed to open docs: %v", err)}
	}
	return actionResultMsg{success: true, message: "📚 Documentation opened in browser"}
}

func (m model) View() string {
	if m.quitting {
		return "\n  👋 Goodbye! Fetch is resting.\n\n"
	}

	switch m.screen {
	case screenSplash:
		return m.viewSplash()
	case screenConfig:
		return m.viewConfig()
	case screenLogs:
		return m.viewLogs()
	case screenStatus:
		return m.viewStatus()
	case screenSetup:
		return m.viewSetup()
	case screenModels:
		return m.viewModels()
	case screenVersion:
		return m.viewVersion()
	default:
		return m.viewMenu()
	}
}

func (m model) viewMenu() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Status bar at very bottom
	statusBar := components.CombinedStatusBar(
		components.StatusBarState{
			BridgeRunning: m.bridgeRunning,
			KennelRunning: m.kennelRunning,
		},
		[]string{"↑/↓ Navigate", "Enter Select", "q Quit"},
		width,
	)
	statusBarHeight := lipgloss.Height(statusBar)

	// Available height for main content (above status bar)
	contentHeight := height - statusBarHeight

	// Get ASCII dog art (left side)
	dogArt := components.Header(width, contentHeight, m.getStatusString())

	// Build menu panel (right side)
	menuPanel := m.renderMenuPanel()

	// Action message (show above menu if present)
	var actionMsg string
	if m.actionMessage != "" {
		actionMsg = components.ActionMessage(m.actionMessage, m.actionSuccess) + "\n\n"
	}

	// Right side: FETCH title + menu
	fetchTitle := lipgloss.NewStyle().
		Foreground(theme.Primary).
		Bold(true).
		Render(`███████╗███████╗████████╗ ██████╗██╗  ██╗
██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
█████╗  █████╗     ██║   ██║     ███████║
██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
██║     ███████╗   ██║   ╚██████╗██║  ██║
╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝`)

	tagline := lipgloss.NewStyle().
		Foreground(theme.TextSecondary).
		Italic(true).
		Render("Your Faithful Code Companion")

	rightContent := lipgloss.JoinVertical(lipgloss.Left,
		fetchTitle,
		tagline,
		"",
		actionMsg+menuPanel,
	)

	// Join horizontally: dog on left, menu on right
	mainContent := lipgloss.JoinHorizontal(lipgloss.Top,
		dogArt,
		"    ", // gap between dog and menu
		rightContent,
	)
	mainContentHeight := lipgloss.Height(mainContent)

	// Calculate spacer to push content to bottom
	spacerHeight := contentHeight - mainContentHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	// Horizontal layout: dog left, content right - aligned to bottom
	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		mainContent,
		statusBar,
	)
}

func (m model) getStatusString() string {
	if m.bridgeRunning && m.kennelRunning {
		return "running"
	} else if m.bridgeRunning || m.kennelRunning {
		return "partial"
	}
	return "stopped"
}

func (m model) renderMenuPanel() string {
	var b strings.Builder

	// Menu title with visible styling (aligned with status bar padding)
	menuTitle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Secondary).
		Background(theme.Surface).
		Padding(0, 1).
		Render("✨ Main Menu ✨")

	b.WriteString("  " + menuTitle + "\n")

	// Menu items (aligned with status bar's 2-space padding)
	for i, choice := range m.choices {
		if m.cursor == i {
			// Selected item
			cursor := lipgloss.NewStyle().
				Foreground(theme.Primary).
				Bold(true).
				Render("▸ ")
			item := lipgloss.NewStyle().
				Foreground(theme.Primary).
				Bold(true).
				Render(choice)
			b.WriteString(" " + cursor + item + "\n")
		} else {
			// Normal item
			item := lipgloss.NewStyle().
				Foreground(theme.TextPrimary).
				Render(choice)
			b.WriteString("   " + item + "\n")
		}
	}

	return b.String()
}

func (m model) viewSplash() string {
	width := m.width
	height := m.height
	if width == 0 {
		width = 80
	}
	if height == 0 {
		height = 24
	}
	return components.Splash(width, height)
}

func (m model) viewVersion() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Version content
	versionContent := components.Version(m.versionInfo, width)
	versionHeight := lipgloss.Height(versionContent)

	// Help bar
	helpBar := components.HelpBar([]string{"Esc Back"}, width)
	helpHeight := lipgloss.Height(helpBar)

	// Spacer at top to push content to bottom
	spacerHeight := height - versionHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		versionContent,
		helpBar,
	)
}

func (m model) viewConfig() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("⚙️  Configuration", width-4)

	var content strings.Builder
	if m.configEditor != nil {
		content.WriteString(m.configEditor.View())
	}

	// Help bar
	helpBar := components.HelpBar(
		[]string{"↑/↓ Navigate", "Enter Edit", "s Save", "Esc Back"},
		width,
	)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	configContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(configContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		configContent,
		helpBar,
	)
}

func (m model) viewModels() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("🤖 AI Model Selection", width-4)

	var content strings.Builder
	if m.modelSelector != nil {
		content.WriteString(m.modelSelector.View())
	} else {
		content.WriteString(theme.StatusInfo.Render("   Loading model selector...") + "\n")
	}

	// Help bar
	helpBar := components.HelpBar(
		[]string{"↑/↓ Navigate", "Enter Select", "Tab Toggle", "Esc Back"},
		width,
	)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	modelContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(modelContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		modelContent,
		helpBar,
	)
}

func (m model) viewLogs() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("📜 Recent Logs", width-4)

	var content strings.Builder
	if len(m.logLines) == 0 {
		content.WriteString(theme.StatusInfo.Render("No logs available. Is Fetch running?") + "\n")
	} else {
		for _, line := range m.logLines {
			content.WriteString(line + "\n")
		}
	}

	// Help bar
	helpBar := components.HelpBar(
		[]string{"r Refresh", "Esc Back"},
		width,
	)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	logContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(logContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		logContent,
		helpBar,
	)
}

func (m model) viewStatus() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("ℹ️  System Status", width-4)

	var content strings.Builder

	// Bridge status
	bridgeIcon := "●"
	bridgeLabel := "Stopped"
	bridgeStyle := theme.StatusError
	if m.bridgeRunning {
		bridgeLabel = "Running"
		bridgeStyle = theme.StatusSuccess
	}
	content.WriteString(fmt.Sprintf("   Bridge (WhatsApp):  %s\n", bridgeStyle.Render(bridgeIcon+" "+bridgeLabel)))

	// Kennel status
	kennelIcon := "●"
	kennelLabel := "Stopped"
	kennelStyle := theme.StatusError
	if m.kennelRunning {
		kennelLabel = "Running"
		kennelStyle = theme.StatusSuccess
	}
	content.WriteString(fmt.Sprintf("   Kennel (AI Agents): %s\n", kennelStyle.Render(kennelIcon+" "+kennelLabel)))

	// Help bar
	helpBar := components.HelpBar(
		[]string{"r Refresh", "Esc Back"},
		width,
	)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	statusContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(statusContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		statusContent,
		helpBar,
	)
}

func (m model) viewSetup() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("📱 WhatsApp Setup", width-4)

	var content strings.Builder

	if m.bridgeStatus == nil {
		content.WriteString(theme.StatusInfo.Render("Connecting to Fetch Bridge...") + "\n")
		content.WriteString(theme.Subtitle.Render("Make sure Fetch is running (Start Fetch from menu)") + "\n")
	} else {
		// Show status
		stateEmoji := m.bridgeStatus.StateEmoji()
		stateDesc := m.bridgeStatus.StateDescription()
		content.WriteString(fmt.Sprintf("Status: %s %s\n\n", stateEmoji, stateDesc))

		switch m.bridgeStatus.State {
		case "qr_pending":
			content.WriteString(theme.StatusInfo.Render("📱 Scan this QR code with WhatsApp:") + "\n\n")

			if m.bridgeStatus.QRCode != nil {
				// Render QR code in terminal
				qrText := renderQRCode(*m.bridgeStatus.QRCode)
				content.WriteString(qrText + "\n\n")
				content.WriteString(theme.StatusSuccess.Render("Press 'o' to open QR in browser | 'r' to refresh") + "\n")
			} else if m.bridgeStatus.QRUrl != nil {
				content.WriteString(theme.QRBox.Render(
					"Press 'o' to open QR in browser:\n\n"+*m.bridgeStatus.QRUrl,
				) + "\n\n")
			} else {
				content.WriteString(theme.Subtitle.Render("QR code generating... wait a moment.") + "\n")
			}

		case "authenticated":
			content.WriteString(theme.StatusSuccess.Render("✅ WhatsApp is connected and ready!") + "\n\n")
			content.WriteString(fmt.Sprintf("Uptime: %s\n", m.bridgeStatus.FormatUptime()))
			content.WriteString(fmt.Sprintf("Messages: %d\n", m.bridgeStatus.MessageCount))

		case "disconnected":
			content.WriteString(theme.StatusError.Render("WhatsApp disconnected.") + "\n")
			if m.bridgeStatus.LastError != nil {
				content.WriteString(theme.Subtitle.Render(fmt.Sprintf("Reason: %s", *m.bridgeStatus.LastError)) + "\n")
			}
			content.WriteString("\nTry restarting Fetch to reconnect.\n")

		case "error":
			content.WriteString(theme.StatusError.Render("An error occurred.") + "\n")
			if m.bridgeStatus.LastError != nil {
				content.WriteString(theme.Subtitle.Render(fmt.Sprintf("Error: %s", *m.bridgeStatus.LastError)) + "\n")
			}

		default:
			content.WriteString(theme.Subtitle.Render("Starting up...") + "\n")
		}
	}

	// Help bar
	helpKeys := []string{"r Refresh", "Esc Back"}
	if m.bridgeStatus != nil && m.bridgeStatus.State == "qr_pending" {
		helpKeys = []string{"o Open QR", "r Refresh", "Esc Back"}
	}
	helpBar := components.HelpBar(helpKeys, width)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	setupContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(setupContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		setupContent,
		helpBar,
	)
}

// renderQRCode renders a QR code as ASCII art for the terminal
func renderQRCode(data string) string {
	qr, err := qrcode.New(data, qrcode.Medium)
	if err != nil {
		return "   Error generating QR code"
	}

	// Get the QR code as a bitmap
	bitmap := qr.Bitmap()
	var sb strings.Builder

	// Use unicode block characters for compact display
	for y := 0; y < len(bitmap)-1; y += 2 {
		sb.WriteString("   ") // Left padding
		for x := 0; x < len(bitmap[y]); x++ {
			top := bitmap[y][x]
			bottom := false
			if y+1 < len(bitmap) {
				bottom = bitmap[y+1][x]
			}

			// Use half-block characters for 2:1 aspect ratio
			if top && bottom {
				sb.WriteString("█")
			} else if top {
				sb.WriteString("▀")
			} else if bottom {
				sb.WriteString("▄")
			} else {
				sb.WriteString(" ")
			}
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running Fetch Manager: %v", err)
		os.Exit(1)
	}
}
