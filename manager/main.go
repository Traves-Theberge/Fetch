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

	"github.com/charmbracelet/bubbles/progress"
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
)

// screen represents the current TUI screen.
type screen int

// Screen constants for navigation
const (
	screenSplash    screen = iota // Initial splash screen
	screenMenu                    // Main menu
	screenConfig                  // Configuration editor
	screenLogs                    // Log viewer
	screenStatus                  // System status
	screenSetup                   // WhatsApp setup wizard
	screenModels                  // AI model selector
	screenVersion                 // Version information
	screenWhitelist               // Trusted numbers manager
	screenGitHub                  // GitHub authentication screen
)

// Bubble Tea messages for async operations

// statusMsg carries Docker container status updates
type statusMsg struct {
	bridgeRunning bool
	kennelRunning bool
	err           error
}

// actionResultMsg carries results from user-initiated actions
type actionResultMsg struct {
	success bool
	message string
}

// logMsg carries log lines from container logs
type logMsg struct {
	lines []string
}

// bridgeStatusMsg carries Bridge API status updates
type bridgeStatusMsg struct {
	status *status.BridgeStatus
	err    error
}

// ghAuthResultMsg carries the result of gh auth login
type ghAuthResultMsg struct {
	err error
}

// ghStatusMsg carries the result of checking gh auth status
type ghStatusMsg struct {
	authed bool
	user   string
	err    error
}

// tickMsg triggers periodic status updates
type tickMsg time.Time

// qrRefreshTickMsg triggers the QR code refresh countdown
type qrRefreshTickMsg time.Time

// splashDoneMsg signals splash screen timeout
type splashDoneMsg struct{}

// QR code refresh interval (WhatsApp QR codes expire after ~20 seconds)
const qrRefreshInterval = 20 * time.Second

// model is the main Bubble Tea model for the TUI
type model struct {
	screen           screen
	choices          []string
	cursor           int
	quitting         bool
	bridgeRunning    bool
	kennelRunning    bool
	statusLoaded     bool
	actionMessage    string
	actionSuccess    bool
	logLines         []string
	logViewer        *components.LogViewer
	configEditor     *config.Editor
	modelSelector    *models.Selector
	whitelistManager *config.WhitelistManager
	width            int
	height           int
	bridgeStatus     *status.BridgeStatus
	statusClient     *status.Client
	versionInfo      components.VersionInfo
	// Config sub-screen: 0=sub-menu, 1=editor, 2=model selector
	configMode       int
	// GitHub auth state
	ghUser     string // GitHub username from gh auth status
	ghAuthed   bool   // Whether GitHub is authenticated
	ghChecking bool   // Whether we're currently checking status
	// QR code refresh state
	qrProgress     progress.Model
	qrCountdown    int // Seconds remaining until refresh
	qrMaxCountdown int // Total countdown time
}

func initialModel() model {
	// Create progress bar for QR countdown
	prog := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(30),
		progress.WithoutPercentage(),
	)

	qrCountdown := int(qrRefreshInterval.Seconds())

	return model{
		screen:         screenSplash,
		statusClient:   status.NewClient(),
		versionInfo:    components.DefaultVersionInfo(),
		logViewer:      components.NewLogViewer(80, 24),
		qrProgress:     prog,
		qrCountdown:    qrCountdown,
		qrMaxCountdown: qrCountdown,
		choices: []string{
			"📱 Setup WhatsApp",
			"� GitHub Auth",
			"🚀 Start Fetch",
			"🛑 Stop Fetch",
			"⚙️  Configure",
			"🔐 Trusted Numbers",
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

// fetchBridgeStatusCmd fetches the current bridge status as a tea.Cmd
func fetchBridgeStatusCmd(client *status.Client) tea.Cmd {
	return func() tea.Msg {
		s, err := client.GetStatus()
		return bridgeStatusMsg{status: s, err: err}
	}
}

// Tick for polling bridge status
func tickCmd() tea.Cmd {
	return tea.Tick(2*time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

// Tick for QR code refresh countdown (every second)
func qrRefreshTickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return qrRefreshTickMsg(t)
	})
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		if m.logViewer != nil {
			m.logViewer.SetSize(msg.Width, msg.Height)
		}
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
		if m.logViewer != nil {
			entries := make([]components.LogEntry, 0, len(msg.lines))
			for _, line := range msg.lines {
				entries = append(entries, logs.ParseLogLine(line, "bridge"))
			}
			m.logViewer.SetLogs(entries)
		}
		return m, nil

	case bridgeStatusMsg:
		if msg.err == nil {
			oldQRCode := ""
			if m.bridgeStatus != nil && m.bridgeStatus.QRCode != nil {
				oldQRCode = *m.bridgeStatus.QRCode
			}
			m.bridgeStatus = msg.status
			// Only reset countdown when we get a NEW QR code (different from before)
			if msg.status != nil && msg.status.State == "qr_pending" && msg.status.QRCode != nil {
				newQRCode := *msg.status.QRCode
				if oldQRCode != newQRCode {
					m.qrCountdown = m.qrMaxCountdown
				}
			}
		}
		return m, nil

	case ghAuthResultMsg:
		if msg.err != nil {
			m.actionMessage = fmt.Sprintf("GitHub auth failed: %v", msg.err)
			m.actionSuccess = false
		} else {
			m.actionMessage = "✅ GitHub authenticated! Restart Fetch to apply."
			m.actionSuccess = true
		}
		// Re-check status after login attempt
		if m.screen == screenGitHub {
			m.ghChecking = true
			return m, checkGhStatusCmd()
		}
		return m, nil

	case ghStatusMsg:
		m.ghChecking = false
		m.ghAuthed = msg.authed
		m.ghUser = msg.user
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
		// If we're in config screen with model picker, update editor and return to editor
		if m.screen == screenConfig && m.configMode == 2 {
			if msg.Err == nil && m.modelSelector != nil && m.configEditor != nil {
				m.configEditor.SetFieldValue("AGENT_MODEL", m.modelSelector.SelectedModel())
			}
			// Brief delay so user sees "Saved!" then return to editor
		}
		return m, nil

	case progress.FrameMsg:
		// Handle progress bar animation
		progressModel, cmd := m.qrProgress.Update(msg)
		m.qrProgress = progressModel.(progress.Model)
		return m, cmd

	case qrRefreshTickMsg:
		// Only countdown if on setup screen and QR is pending
		if m.screen == screenSetup && m.bridgeStatus != nil && m.bridgeStatus.State == "qr_pending" {
			m.qrCountdown--
			if m.qrCountdown <= 0 {
				// Auto-refresh: fetch new status
				m.qrCountdown = m.qrMaxCountdown
				return m, tea.Batch(fetchBridgeStatusCmd(m.statusClient), qrRefreshTickCmd())
			}
			// Update progress bar
			percent := float64(m.qrCountdown) / float64(m.qrMaxCountdown)
			cmd := m.qrProgress.SetPercent(percent)
			return m, tea.Batch(cmd, qrRefreshTickCmd())
		}
		return m, nil

	case tickMsg:
		// Only poll if on setup screen AND we don't have status yet
		if m.screen == screenSetup && m.bridgeStatus == nil {
			return m, tea.Batch(fetchBridgeStatusCmd(m.statusClient), tickCmd())
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
		case screenWhitelist:
			return m.updateWhitelist(msg)
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
		case screenGitHub:
			return m.updateGitHub(msg)
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
			m.qrCountdown = m.qrMaxCountdown // Reset countdown
			return m, tea.Batch(fetchBridgeStatusCmd(m.statusClient), tickCmd(), qrRefreshTickCmd())
		case 1: // GitHub Auth — show auth status screen
			m.screen = screenGitHub
			m.ghChecking = true
			return m, checkGhStatusCmd()
		case 2: // Start
			return m, startFetchCmd()
		case 3: // Stop
			return m, stopFetchCmd()
		case 4: // Configure — go straight to editor
			m.screen = screenConfig
			m.configMode = 1 // Editor mode directly
			m.configEditor = config.NewEditor()
			m.configEditor.SetSize(m.height - 8)
			return m, nil
		case 5: // Trusted Numbers
			m.screen = screenWhitelist
			m.whitelistManager = config.NewWhitelistManager()
			return m, nil
		case 6: // Logs
			m.screen = screenLogs
			return m, fetchLogs
		case 7: // Documentation
			return m, openDocs
		case 8: // Version
			m.screen = screenVersion
			return m, nil
		case 9: // Exit
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
	switch m.configMode {
	case 1: // Editor mode
		if m.configEditor != nil && !m.configEditor.ModelPickerRequested() {
			switch msg.String() {
			case "esc":
				m.screen = screenMenu
				return m, nil
			}
		}
		if m.configEditor != nil {
			m.configEditor.Update(msg)
			// Check if editor wants the model picker
			if m.configEditor.ModelPickerRequested() {
				m.configEditor.ClearModelPickerRequest()
				m.configMode = 2
				m.modelSelector = models.NewSelector()
				return m, models.FetchModelsCmd
			}
		}
		return m, nil

	case 2: // Model picker overlay
		switch msg.String() {
		case "esc":
			m.configMode = 1
			m.modelSelector = nil
			return m, nil
		}
		if m.modelSelector != nil {
			var cmd tea.Cmd
			m.modelSelector, cmd = m.modelSelector.Update(msg)
			return m, cmd
		}
		return m, nil
	}

	return m, nil
}

func (m model) updateWhitelist(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Only allow escape when not in add mode
	if !m.whitelistManager.IsAdding() {
		switch msg.String() {
		case "esc", "q":
			m.screen = screenMenu
			return m, nil
		}
	}

	if m.whitelistManager != nil {
		m.whitelistManager.Update(msg)
	}

	return m, nil
}

func (m model) updateModels(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Model selection is now handled within the config screen
	m.screen = screenMenu
	return m, nil
}

func (m model) updateLogs(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	}
	// Delegate all other keys to LogViewer (scroll, copy, wrap, etc.)
	if m.logViewer != nil {
		m.logViewer, _ = m.logViewer.Update(msg)
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

func (m model) updateGitHub(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.screen = screenMenu
		return m, nil
	case "enter", "l":
		// Launch gh auth login interactively
		c := exec.Command("gh", "auth", "login")
		return m, tea.ExecProcess(c, func(err error) tea.Msg {
			return ghAuthResultMsg{err: err}
		})
	case "r":
		// Manual refresh
		m.ghChecking = true
		return m, checkGhStatusCmd()
	}
	return m, nil
}

// Commands

// startFetchCmd returns a command that starts Docker services
func startFetchCmd() tea.Cmd {
	return func() tea.Msg {
		err := docker.StartServices()
		if err != nil {
			return actionResultMsg{success: false, message: fmt.Sprintf("Failed to start: %v", err)}
		}
		return actionResultMsg{success: true, message: "✅ Fetch services started!"}
	}
}

// stopFetchCmd returns a command that stops Docker services
func stopFetchCmd() tea.Cmd {
	return func() tea.Msg {
		err := docker.StopServices()
		if err != nil {
			return actionResultMsg{success: false, message: fmt.Sprintf("Failed to stop: %v", err)}
		}
		return actionResultMsg{success: true, message: "🛑 Fetch services stopped."}
	}
}

func fetchLogs() tea.Msg {
	lines := logs.GetRecentLogs("fetch-bridge", 200)
	return logMsg{lines: lines}
}

func openDocs() tea.Msg {
	docsURL := "http://localhost:8765/docs"
	err := exec.Command("xdg-open", docsURL).Start()
	if err != nil {
		return actionResultMsg{success: false, message: fmt.Sprintf("Failed to open docs: %v", err)}
	}
	return actionResultMsg{success: true, message: "📚 Documentation opened in browser"}
}

func disconnectWhatsApp(client *status.Client) tea.Cmd {
	return func() tea.Msg {
		result, err := client.Logout()
		if err != nil {
			return actionResultMsg{success: false, message: fmt.Sprintf("Failed to disconnect: %v", err)}
		}
		if result.Success {
			return actionResultMsg{success: true, message: "🔌 WhatsApp disconnected. Restart Fetch to reconnect."}
		}
		return actionResultMsg{success: false, message: fmt.Sprintf("Disconnect failed: %s", result.Message)}
	}
}

// checkGhStatusCmd checks current GitHub auth status via gh CLI
func checkGhStatusCmd() tea.Cmd {
	return func() tea.Msg {
		out, err := exec.Command("gh", "auth", "status").CombinedOutput()
		if err != nil {
			// Not authenticated or gh not installed
			return ghStatusMsg{authed: false, user: "", err: nil}
		}
		// Parse output for account name: "Logged in to github.com account USERNAME"
		output := string(out)
		user := ""
		for _, line := range strings.Split(output, "\n") {
			line = strings.TrimSpace(line)
			if strings.Contains(line, "account") && strings.Contains(line, "github.com") {
				// Extract username from "Logged in to github.com account USERNAME (..."
				parts := strings.Split(line, "account ")
				if len(parts) >= 2 {
					user = strings.TrimSpace(parts[1])
					// Remove trailing parenthetical if present
					if idx := strings.Index(user, " "); idx > 0 {
						user = user[:idx]
					}
				}
			}
		}
		return ghStatusMsg{authed: true, user: user, err: nil}
	}
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
	case screenWhitelist:
		return m.viewWhitelist()
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
	case screenGitHub:
		return m.viewGitHub()
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

	var titleStr string
	var content strings.Builder
	var helpKeys []string

	switch m.configMode {
	case 2: // Model picker overlay
		titleStr = layout.SectionHeader("🤖 Select Model", width-4)
		if m.modelSelector != nil {
			content.WriteString(m.modelSelector.View())
		} else {
			content.WriteString(theme.StatusInfo.Render("   Loading models...") + "\n")
		}
		helpKeys = []string{"↑/↓ Navigate", "Enter Select", "Tab Toggle", "Esc Back"}

	default: // Editor mode
		titleStr = layout.SectionHeader("⚙️  Configuration", width-4)
		if m.configEditor != nil {
			m.configEditor.SetSize(height - 8)
			content.WriteString(m.configEditor.View())
		}
		helpKeys = []string{"↑/↓ Navigate", "Enter Edit", "s Save", "Esc Back"}
	}

	helpBar := components.HelpBar(helpKeys, width)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	configContent := titleStr + "\n\n" + content.String()
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

func (m model) viewWhitelist() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("🔐 Trusted Numbers", width-4)

	var content strings.Builder
	if m.whitelistManager != nil {
		content.WriteString(m.whitelistManager.View())
	}

	// Help bar
	helpBar := components.HelpBar(
		[]string{"↑/↓ Navigate", "a Add", "d Delete", "r Refresh", "Esc Back"},
		width,
	)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	whitelistContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(whitelistContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		whitelistContent,
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
	title := layout.SectionHeader("🤖 Select Model", width-4)

	var content strings.Builder
	if m.modelSelector != nil {
		content.WriteString(m.modelSelector.View())
	} else {
		content.WriteString(theme.StatusInfo.Render("   Loading model selector...") + "\n")
	}

	// Help bar
	helpKeys := []string{"↑/↓ Navigate", "Enter Select", "Tab Toggle", "Esc Back"}
	helpBar := components.HelpBar(helpKeys, width)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	modelContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(modelContent)

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

func (m model) viewGitHub() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	// Title
	title := layout.SectionHeader("🔑 GitHub Authentication", width-4)

	var content strings.Builder

	if m.ghChecking {
		content.WriteString(theme.StatusInfo.Render("   Checking GitHub auth status...") + "\n")
	} else if m.ghAuthed {
		content.WriteString(theme.StatusSuccess.Render("   ● Authenticated") + "\n\n")
		if m.ghUser != "" {
			content.WriteString(fmt.Sprintf("   Account:  %s\n", theme.Value.Render(m.ghUser)))
		}
		content.WriteString(fmt.Sprintf("   Provider: %s\n", theme.Value.Render("github.com")))
		content.WriteString("\n")
		content.WriteString(theme.Subtitle.Render("   Press Enter to re-authenticate or r to refresh.") + "\n")
	} else {
		content.WriteString(theme.StatusError.Render("   ● Not Authenticated") + "\n\n")
		content.WriteString(theme.Subtitle.Render("   GitHub auth is required for Fetch to access repositories") + "\n")
		content.WriteString(theme.Subtitle.Render("   and manage pull requests via the coding agents.") + "\n\n")
		content.WriteString(theme.StatusInfo.Render("   Press Enter to authenticate with GitHub.") + "\n")
	}

	// Help bar
	helpKeys := []string{"Enter Login", "r Refresh", "Esc Back"}
	helpBar := components.HelpBar(helpKeys, width)
	helpHeight := lipgloss.Height(helpBar)

	// Content area
	ghContent := title + "\n\n" + content.String()
	contentHeight := lipgloss.Height(ghContent)

	// Spacer at top to push content to bottom
	spacerHeight := height - contentHeight - helpHeight
	if spacerHeight < 0 {
		spacerHeight = 0
	}
	topSpacer := strings.Repeat("\n", spacerHeight)

	return lipgloss.JoinVertical(lipgloss.Left,
		topSpacer,
		ghContent,
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

	if m.logViewer != nil {
		m.logViewer.SetSize(width, height)
		return m.logViewer.View()
	}

	// Fallback if logViewer not initialized
	title := layout.SectionHeader("📜 Recent Logs", width-4)

	var content strings.Builder
	if len(m.logLines) == 0 {
		content.WriteString(theme.StatusInfo.Render("No logs available. Is Fetch running?") + "\n")
	} else {
		for _, line := range m.logLines {
			content.WriteString(line + "\n")
		}
	}

	helpBar := components.HelpBar(
		[]string{"Esc Back"},
		width,
	)

	return lipgloss.JoinVertical(lipgloss.Left,
		title,
		content.String(),
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
				// Render QR code in terminal (compact)
				qrText := renderQRCodeCompact(*m.bridgeStatus.QRCode)
				content.WriteString(qrText + "\n")

				// Show countdown progress bar
				content.WriteString(fmt.Sprintf("\n⏱️  Auto-refresh in %ds ", m.qrCountdown))
				content.WriteString(m.qrProgress.View() + "\n\n")
				content.WriteString(theme.Subtitle.Render("'o' open in browser | Esc go back") + "\n")
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
	helpKeys := []string{"Esc Back"}
	if m.bridgeStatus != nil && m.bridgeStatus.State == "qr_pending" {
		helpKeys = []string{"o Open QR", "Esc Back"}
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

// renderQRCodeCompact renders a smaller QR code using Low error correction
// and skipping every other pixel for a more compact display
func renderQRCodeCompact(data string) string {
	// Use Low error correction for smaller QR code
	qr, err := qrcode.New(data, qrcode.Low)
	if err != nil {
		return "   Error generating QR code"
	}

	// Get the QR code as a bitmap
	bitmap := qr.Bitmap()

	// Style for the QR code box
	boxStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FF6B35")).
		Padding(0, 1)

	var qrContent strings.Builder

	// Use unicode block characters - combine 2 rows into 1 line
	for y := 0; y < len(bitmap)-1; y += 2 {
		for x := 0; x < len(bitmap[y]); x++ {
			top := bitmap[y][x]
			bottom := false
			if y+1 < len(bitmap) {
				bottom = bitmap[y+1][x]
			}

			// Use half-block characters for 2:1 aspect ratio
			if top && bottom {
				qrContent.WriteString("█")
			} else if top {
				qrContent.WriteString("▀")
			} else if bottom {
				qrContent.WriteString("▄")
			} else {
				qrContent.WriteString(" ")
			}
		}
		qrContent.WriteString("\n")
	}

	// Wrap in a styled box
	return boxStyle.Render(qrContent.String())
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running Fetch Manager: %v", err)
		os.Exit(1)
	}
}
