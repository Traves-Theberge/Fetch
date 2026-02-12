// Fetch Manager - A TUI for managing Fetch services.
//
// Provides Docker Compose control, configuration editing, log viewing,
// and git-based updates through an interactive terminal interface.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
	screenSplash      screen = iota // Initial splash screen
	screenMenu                      // Main menu
	screenConfig                    // Configuration editor
	screenLogs                      // Log viewer
	screenStatus                    // System status
	screenSetup                     // WhatsApp setup wizard
	screenVersion                   // Version information
	screenWhitelist                 // Trusted numbers manager
	screenHarnessAuth               // Harness authentication screen
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

// harnessID identifies a CLI harness for auth management
type harnessID int

const (
	harnessGitHub   harnessID = iota // gh auth (Copilot uses gh CLI)
	harnessClaude                    // claude auth
	harnessGemini                    // gemini CLI
	harnessOpenCode                  // opencode auth
	harnessCodex                     // codex login
)

// harnessAuthStatus represents the auth state for a single CLI harness
type harnessAuthStatus struct {
	id        harnessID
	name      string // Display name
	icon      string // Emoji icon
	authed    bool
	detail    string // Extra info (username, credential path)
	installed bool   // Whether CLI is on host PATH
	// GitHub-specific (multi-account)
	ghAccounts []ghAccount
	ghCursor   int
	// Config fields (loaded from .env)
	enabled   bool
	apiKey    string
	model     string
	enableKey string // e.g. "ENABLE_COPILOT"
	apiKeyKey string // e.g. "GH_TOKEN", "ANTHROPIC_API_KEY"
	modelKey  string // e.g. "COPILOT_MODEL"
	apiLabel  string // "Token" (GitHub) or "API Key" (others)
}

// ghAccount represents a single GitHub account from gh auth status
type ghAccount struct {
	user     string
	active   bool
	protocol string
	scopes   string
}

// harnessAuthResultMsg carries the result of any harness login/logout
type harnessAuthResultMsg struct {
	harness harnessID
	err     error
}

// harnessStatusMsg carries status check results for all harnesses
type harnessStatusMsg struct {
	statuses []harnessAuthStatus
}

// harnessConfigMsg carries config values loaded from .env
type harnessConfigMsg struct {
	values map[string]string
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
	mainMenu         *components.Menu
	settingsMenu     *components.Menu // Sub-menu for Settings
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
	configMode int
	// Harness auth state
	harnessStatuses   []harnessAuthStatus // Auth status for all 5 harnesses
	harnessCursor     int                 // Which harness is selected (0-4)
	harnessChecking   bool                // Whether we're currently checking
	harnessEditing    bool                // In text edit mode for config field
	harnessEditField  string              // "apikey" or "model"
	harnessEditBuffer string              // Accumulated text
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

	// New Custom Order:
	// 1. Start Fetch
	// 2. Stop Fetch
	// 3. Setup WhatsApp
	// 4. View Logs
	// 5. Documentation
	// 6. Settings (Sub-menu)
	// 7. Version
	// 8. Exit
	menu := components.NewMenu("", []components.MenuItem{
		{Icon: "\U0001f680", Label: "Start Fetch"},
		{Icon: "\U0001f6d1", Label: "Stop Fetch"},
		{Icon: "\U0001f4f1", Label: "Setup WhatsApp"},
		{Icon: "\U0001f4dc", Label: "View Logs"},
		{Icon: "\U0001f4da", Label: "Documentation"},
		{Icon: "\u2699\ufe0f ", Label: "Settings"},
		{Icon: "\u2139\ufe0f ", Label: "Version"},
		{Icon: "\u274c", Label: "Exit"},
	}, 40)

	settingsMenu := components.NewMenu("", []components.MenuItem{
		{Icon: "\u2699\ufe0f ", Label: "General Configuration"},
		{Icon: "\U0001f436", Label: "Harnesses"},
		{Icon: "\U0001f510", Label: "Trusted Numbers"},
		{Icon: "\u21a9\ufe0f ", Label: "Back"},
	}, 40)

	return model{
		screen:         screenSplash,
		statusClient:   status.NewClient(),
		versionInfo:    components.DefaultVersionInfo(),
		logViewer:      components.NewLogViewer(80, 24),
		qrProgress:     prog,
		qrCountdown:    qrCountdown,
		qrMaxCountdown: qrCountdown,
		mainMenu:       menu,
		settingsMenu:   settingsMenu,
		harnessStatuses: []harnessAuthStatus{
			{id: harnessGitHub, name: "GitHub (Copilot)", icon: "\U0001f4bb", enableKey: "ENABLE_COPILOT", apiKeyKey: "GH_TOKEN", modelKey: "COPILOT_MODEL", apiLabel: "Token"},
			{id: harnessClaude, name: "Claude Code", icon: "\U0001f9e0", enableKey: "ENABLE_CLAUDE", apiKeyKey: "ANTHROPIC_API_KEY", modelKey: "CLAUDE_MODEL", apiLabel: "API Key"},
			{id: harnessGemini, name: "Gemini CLI", icon: "\u2728", enableKey: "ENABLE_GEMINI", apiKeyKey: "GEMINI_API_KEY", modelKey: "GEMINI_MODEL", apiLabel: "API Key"},
			{id: harnessOpenCode, name: "OpenCode", icon: "\U0001f527", enableKey: "ENABLE_OPENCODE", apiKeyKey: "OPENCODE_API_KEY", modelKey: "OPENCODE_MODEL", apiLabel: "API Key"},
			{id: harnessCodex, name: "Codex", icon: "\U0001f916", enableKey: "ENABLE_CODEX", apiKeyKey: "CODEX_API_KEY", modelKey: "CODEX_MODEL", apiLabel: "API Key"},
		},
	}
}

// buildMenuBadges updates menu item badges based on current state
func (m model) buildMenuBadges() {
	if m.mainMenu == nil {
		return
	}
	items := m.mainMenu.Items

	// Start/Stop Fetch badges based on running state
	// Index 0: Start Fetch
	// Index 1: Stop Fetch
	if m.statusLoaded {
		if m.bridgeRunning && m.kennelRunning {
			items[0].Badge = "[Running]" // Start Fetch
			items[1].Badge = ""          // Stop Fetch
		} else if m.bridgeRunning || m.kennelRunning {
			items[0].Badge = "[Partial]"
			items[1].Badge = ""
		} else {
			items[0].Badge = "[Stopped]"
			items[1].Badge = ""
		}
	}

	// Harness Auth badge - Moved to Settings item (Index 5)
	authCount := 0
	for _, hs := range m.harnessStatuses {
		if hs.authed {
			authCount++
		}
	}
	if authCount > 0 {
		items[5].Badge = fmt.Sprintf("[%d/%d auth]", authCount, len(m.harnessStatuses))
	} else {
		items[5].Badge = ""
	}

	m.mainMenu.Items = items
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

	case harnessAuthResultMsg:
		if msg.err != nil {
			m.actionMessage = fmt.Sprintf("%s auth failed: %v", harnessName(msg.harness), msg.err)
			m.actionSuccess = false
		} else {
			m.actionMessage = fmt.Sprintf("✅ %s authenticated! Restart Fetch to apply.", harnessName(msg.harness))
			m.actionSuccess = true
		}
		// Re-check status after login/logout attempt
		if m.screen == screenHarnessAuth {
			m.harnessChecking = true
			return m, checkAllHarnessStatusCmd()
		}
		return m, nil

	case harnessStatusMsg:
		m.harnessChecking = false
		// Preserve config key mappings and values from existing statuses
		for i := range msg.statuses {
			if i < len(m.harnessStatuses) {
				msg.statuses[i].enableKey = m.harnessStatuses[i].enableKey
				msg.statuses[i].apiKeyKey = m.harnessStatuses[i].apiKeyKey
				msg.statuses[i].modelKey = m.harnessStatuses[i].modelKey
				msg.statuses[i].apiLabel = m.harnessStatuses[i].apiLabel
				msg.statuses[i].enabled = m.harnessStatuses[i].enabled
				msg.statuses[i].apiKey = m.harnessStatuses[i].apiKey
				msg.statuses[i].model = m.harnessStatuses[i].model
			}
		}
		m.harnessStatuses = msg.statuses
		// Clamp cursor
		if m.harnessCursor >= len(m.harnessStatuses) {
			m.harnessCursor = 0
		}
		return m, nil

	case harnessConfigMsg:
		for i := range m.harnessStatuses {
			hs := &m.harnessStatuses[i]
			if v, ok := msg.values[hs.enableKey]; ok {
				hs.enabled = v == "true"
			}
			if v, ok := msg.values[hs.apiKeyKey]; ok {
				hs.apiKey = v
			}
			if v, ok := msg.values[hs.modelKey]; ok {
				hs.model = v
			}
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
		case screenVersion:
			return m.updateVersion(msg)
		case screenHarnessAuth:
			return m.updateHarnessAuth(msg)
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
		m.mainMenu.Up()

	case "down", "j":
		m.mainMenu.Down()

	case "enter", " ":

		switch m.mainMenu.Selected() {
		case 0: // Start Fetch
			return m, startFetchCmd()
		case 1: // Stop Fetch
			return m, stopFetchCmd()
		case 2: // Setup WhatsApp
			m.screen = screenSetup
			m.qrCountdown = m.qrMaxCountdown // Reset countdown
			return m, tea.Batch(fetchBridgeStatusCmd(m.statusClient), tickCmd(), qrRefreshTickCmd())
		case 3: // View Logs
			m.screen = screenLogs
			return m, fetchLogs
		case 4: // Documentation
			return m, openDocs
		case 5: // Settings (Sub-menu)
			m.screen = screenConfig
			m.configMode = 0 // Sub-menu mode
			return m, nil
		case 6: // Version
			m.screen = screenVersion
			return m, nil
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
	case 0: // Settings Sub-menu
		switch msg.String() {
		case "esc", "q":
			m.screen = screenMenu
			return m, nil
		case "up", "k":
			m.settingsMenu.Up()
		case "down", "j":
			m.settingsMenu.Down()
		case "enter", " ":
			switch m.settingsMenu.Selected() {
			case 0: // General Configuration
				m.configMode = 1
				m.configEditor = config.NewEditor()
				m.configEditor.SetSize(m.height - 8)
				return m, nil
			case 1: // Harnesses
				m.screen = screenHarnessAuth
				m.harnessChecking = true
				m.harnessEditing = false
				return m, tea.Batch(checkAllHarnessStatusCmd(), loadHarnessConfigCmd())
			case 2: // Trusted Numbers
				m.screen = screenWhitelist
				m.whitelistManager = config.NewWhitelistManager()
				return m, nil
			case 3: // Back
				m.screen = screenMenu
				return m, nil
			}
		}
		return m, nil

	case 1: // Editor mode
		if m.configEditor != nil && !m.configEditor.ModelPickerRequested() && !m.configEditor.IsSectionPickerOpen() && !m.configEditor.IsEditing() {
			switch msg.String() {
			case "esc":
				m.configMode = 0 // Back to Settings Sub-menu
				return m, nil
			case "right", "left":
				m.configEditor.SwitchMode()
				return m, nil
			}
		}
		if m.configEditor != nil {
			restartNeeded := m.configEditor.Update(msg)
			if restartNeeded {
				return m, restartBridgeCmd()
			}
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
			m.screen = screenConfig
			m.configMode = 0 // Back to Settings Sub-menu
			return m, nil
		}
	}

	if m.whitelistManager != nil {
		m.whitelistManager.Update(msg)
	}

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

func (m model) updateHarnessAuth(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if len(m.harnessStatuses) == 0 {
		if msg.String() == "esc" || msg.String() == "q" {
			m.screen = screenConfig
			m.configMode = 0 // Back to Settings Sub-menu
		}
		return m, nil
	}

	// Text editing mode for API key or model
	if m.harnessEditing {
		switch msg.String() {
		case "enter":
			hs := &m.harnessStatuses[m.harnessCursor]
			if m.harnessEditField == "apikey" {
				hs.apiKey = m.harnessEditBuffer
				_ = config.WriteEnvValue(hs.apiKeyKey, m.harnessEditBuffer)
			} else if m.harnessEditField == "model" {
				hs.model = m.harnessEditBuffer
				_ = config.WriteEnvValue(hs.modelKey, m.harnessEditBuffer)
			}
			m.harnessEditing = false
		case "esc":
			m.harnessEditing = false
		case "backspace":
			if len(m.harnessEditBuffer) > 0 {
				m.harnessEditBuffer = m.harnessEditBuffer[:len(m.harnessEditBuffer)-1]
			}
		default:
			if len(msg.String()) == 1 {
				m.harnessEditBuffer += msg.String()
			}
		}
		return m, nil
	}

	selected := m.harnessStatuses[m.harnessCursor]

	switch msg.String() {
	case "esc", "q":
		m.screen = screenConfig
		m.configMode = 0 // Back to Settings Sub-menu
		return m, nil
	case "up", "k":
		if m.harnessCursor > 0 {
			m.harnessCursor--
		}
		return m, nil
	case "down", "j":
		if m.harnessCursor < len(m.harnessStatuses)-1 {
			m.harnessCursor++
		}
		return m, nil
	case "e":
		// Toggle enable for selected harness
		hs := &m.harnessStatuses[m.harnessCursor]
		hs.enabled = !hs.enabled
		val := "false"
		if hs.enabled {
			val = "true"
		}
		_ = config.WriteEnvValue(hs.enableKey, val)
		return m, nil
	case "a":
		// Edit API key
		m.harnessEditing = true
		m.harnessEditField = "apikey"
		m.harnessEditBuffer = m.harnessStatuses[m.harnessCursor].apiKey
		return m, nil
	case "m":
		// Edit model
		m.harnessEditing = true
		m.harnessEditField = "model"
		m.harnessEditBuffer = m.harnessStatuses[m.harnessCursor].model
		return m, nil
	case "l":
		// Login selected harness
		if !selected.installed {
			m.actionMessage = fmt.Sprintf("%s CLI is not installed", selected.name)
			m.actionSuccess = false
			return m, nil
		}
		return m, loginHarnessCmd(selected.id)
	case "d":
		// Logout selected harness
		if !selected.authed {
			return m, nil
		}
		ghUser := ""
		if selected.id == harnessGitHub && len(selected.ghAccounts) > 0 && selected.ghCursor < len(selected.ghAccounts) {
			ghUser = selected.ghAccounts[selected.ghCursor].user
		}
		return m, logoutHarnessCmd(selected.id, ghUser)
	case "r":
		// Refresh all statuses
		m.harnessChecking = true
		return m, tea.Batch(checkAllHarnessStatusCmd(), loadHarnessConfigCmd())
	case "s":
		// Switch GitHub account (GitHub-specific)
		if selected.id == harnessGitHub && len(selected.ghAccounts) > 1 && selected.ghCursor < len(selected.ghAccounts) {
			acct := selected.ghAccounts[selected.ghCursor]
			if !acct.active {
				return m, switchGhAccountCmd(acct.user)
			}
		}
		return m, nil
	case "left", "h":
		// Navigate GitHub sub-accounts
		if selected.id == harnessGitHub && selected.ghCursor > 0 {
			m.harnessStatuses[m.harnessCursor].ghCursor--
		}
		return m, nil
	case "right", "tab":
		// Navigate GitHub sub-accounts
		if selected.id == harnessGitHub && selected.ghCursor < len(selected.ghAccounts)-1 {
			m.harnessStatuses[m.harnessCursor].ghCursor++
		}
		return m, nil
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

// restartBridgeCmd restarts the bridge container to apply config changes
func restartBridgeCmd() tea.Cmd {
	return func() tea.Msg {
		err := docker.RestartBridge()
		if err != nil {
			return actionResultMsg{success: false, message: fmt.Sprintf("Restart failed: %v", err)}
		}
		return actionResultMsg{success: true, message: "🔄 Config applied! Fetch restarted."}
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

// harnessName returns a display name for a harness ID
func harnessName(id harnessID) string {
	switch id {
	case harnessGitHub:
		return "GitHub"
	case harnessClaude:
		return "Claude"
	case harnessGemini:
		return "Gemini"
	case harnessOpenCode:
		return "OpenCode"
	case harnessCodex:
		return "Codex"
	default:
		return "Unknown"
	}
}

// checkAllHarnessStatusCmd checks auth status for all 5 harnesses
func checkAllHarnessStatusCmd() tea.Cmd {
	return func() tea.Msg {
		statuses := []harnessAuthStatus{
			checkGitHubStatus(),
			checkClaudeStatus(),
			checkGeminiStatus(),
			checkOpenCodeStatus(),
			checkCodexStatus(),
		}
		return harnessStatusMsg{statuses: statuses}
	}
}

// loadHarnessConfigCmd loads harness config values from .env
func loadHarnessConfigCmd() tea.Cmd {
	return func() tea.Msg {
		keys := []string{
			"ENABLE_COPILOT", "GH_TOKEN", "COPILOT_MODEL",
			"ENABLE_CLAUDE", "ANTHROPIC_API_KEY", "CLAUDE_MODEL",
			"ENABLE_GEMINI", "GEMINI_API_KEY", "GEMINI_MODEL",
			"ENABLE_OPENCODE", "OPENCODE_API_KEY", "OPENCODE_MODEL",
			"ENABLE_CODEX", "CODEX_API_KEY", "CODEX_MODEL",
		}
		values := config.ReadEnvValues(keys)
		return harnessConfigMsg{values: values}
	}
}

func checkGitHubStatus() harnessAuthStatus {
	hs := harnessAuthStatus{id: harnessGitHub, name: "GitHub (Copilot)", icon: "\U0001f4bb"}
	if _, err := exec.LookPath("gh"); err != nil {
		return hs
	}
	hs.installed = true
	out, err := exec.Command("gh", "auth", "status").CombinedOutput()
	if err != nil && len(out) == 0 {
		return hs
	}
	// Parse accounts from gh auth status output
	var accounts []ghAccount
	var current *ghAccount
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "Logged in to") && strings.Contains(line, "account") {
			if current != nil {
				accounts = append(accounts, *current)
			}
			current = &ghAccount{}
			parts := strings.Split(line, "account ")
			if len(parts) >= 2 {
				user := strings.TrimSpace(parts[1])
				if idx := strings.Index(user, " "); idx > 0 {
					user = user[:idx]
				}
				current.user = user
			}
		} else if current != nil {
			if strings.HasPrefix(line, "- Active account:") {
				current.active = strings.Contains(line, "true")
			} else if strings.HasPrefix(line, "- Git operations protocol:") {
				current.protocol = strings.TrimPrefix(line, "- Git operations protocol: ")
				current.protocol = strings.TrimSpace(current.protocol)
			} else if strings.HasPrefix(line, "- Token scopes:") {
				current.scopes = strings.TrimPrefix(line, "- Token scopes: ")
				current.scopes = strings.TrimSpace(current.scopes)
			}
		}
	}
	if current != nil {
		accounts = append(accounts, *current)
	}
	hs.ghAccounts = accounts
	hs.authed = len(accounts) > 0
	for _, a := range accounts {
		if a.active {
			hs.detail = a.user
			break
		}
	}
	return hs
}

func checkClaudeStatus() harnessAuthStatus {
	hs := harnessAuthStatus{id: harnessClaude, name: "Claude Code", icon: "\U0001f9e0"}
	if _, err := exec.LookPath("claude"); err != nil {
		return hs
	}
	hs.installed = true
	home, _ := os.UserHomeDir()
	credPath := filepath.Join(home, ".claude", ".credentials.json")
	if _, err := os.Stat(credPath); err == nil {
		hs.authed = true
		hs.detail = "~/.claude/.credentials.json"
	}
	return hs
}

func checkGeminiStatus() harnessAuthStatus {
	hs := harnessAuthStatus{id: harnessGemini, name: "Gemini CLI", icon: "\u2728"}
	if _, err := exec.LookPath("gemini"); err != nil {
		return hs
	}
	hs.installed = true
	home, _ := os.UserHomeDir()
	credPath := filepath.Join(home, ".gemini", "oauth_creds.json")
	if _, err := os.Stat(credPath); err == nil {
		hs.authed = true
		hs.detail = "~/.gemini/oauth_creds.json"
	}
	return hs
}

func checkOpenCodeStatus() harnessAuthStatus {
	hs := harnessAuthStatus{id: harnessOpenCode, name: "OpenCode", icon: "\U0001f527"}
	if _, err := exec.LookPath("opencode"); err != nil {
		return hs
	}
	hs.installed = true
	out, err := exec.Command("opencode", "auth", "list").CombinedOutput()
	if err == nil && len(out) > 0 {
		outStr := strings.TrimSpace(string(out))
		if outStr != "" && !strings.Contains(strings.ToLower(outStr), "no ") {
			hs.authed = true
			lines := strings.Split(outStr, "\n")
			if len(lines) > 0 {
				hs.detail = strings.TrimSpace(lines[0])
			}
		}
	}
	return hs
}

func checkCodexStatus() harnessAuthStatus {
	hs := harnessAuthStatus{id: harnessCodex, name: "Codex", icon: "\U0001f916"}
	if _, err := exec.LookPath("codex"); err != nil {
		return hs
	}
	hs.installed = true
	if err := exec.Command("codex", "login", "status").Run(); err == nil {
		hs.authed = true
		hs.detail = "~/.codex/auth.json"
	}
	return hs
}

// loginHarnessCmd spawns interactive login for the selected harness
func loginHarnessCmd(id harnessID) tea.Cmd {
	var c *exec.Cmd
	switch id {
	case harnessGitHub:
		c = exec.Command("gh", "auth", "login")
	case harnessClaude:
		c = exec.Command("claude", "auth", "login")
	case harnessGemini:
		c = exec.Command("gemini")
	case harnessOpenCode:
		c = exec.Command("opencode", "auth", "login")
	case harnessCodex:
		c = exec.Command("codex", "login")
	default:
		return nil
	}
	hid := id
	return tea.ExecProcess(c, func(err error) tea.Msg {
		return harnessAuthResultMsg{harness: hid, err: err}
	})
}

// logoutHarnessCmd performs logout for the selected harness
func logoutHarnessCmd(id harnessID, ghUser string) tea.Cmd {
	hid := id
	return func() tea.Msg {
		var err error
		switch hid {
		case harnessGitHub:
			if ghUser != "" {
				err = exec.Command("gh", "auth", "logout", "-u", ghUser).Run()
			}
		case harnessClaude:
			err = exec.Command("claude", "auth", "logout").Run()
		case harnessGemini:
			home, _ := os.UserHomeDir()
			err = os.Remove(filepath.Join(home, ".gemini", "oauth_creds.json"))
		case harnessOpenCode:
			err = exec.Command("opencode", "auth", "logout").Run()
		case harnessCodex:
			err = exec.Command("codex", "logout").Run()
		}
		return harnessAuthResultMsg{harness: hid, err: err}
	}
}

// switchGhAccountCmd switches the active GitHub account
func switchGhAccountCmd(user string) tea.Cmd {
	return func() tea.Msg {
		err := exec.Command("gh", "auth", "switch", "-u", user).Run()
		return harnessAuthResultMsg{harness: harnessGitHub, err: err}
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
	case screenVersion:
		return m.viewVersion()
	case screenHarnessAuth:
		return m.viewHarnessAuth()
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

	// Build menu panel
	menuPanel := m.renderMenuPanel()

	// Action message (show above menu if present)
	var actionMsg string
	if m.actionMessage != "" {
		actionMsg = components.ActionMessage(m.actionMessage, m.actionSuccess) + "\n\n"
	}

	var mainContent string

	if layout.IsCompact(width) {
		// Compact mode: no dog art, no big FETCH title, just menu
		compactTitle := components.CompactHeader("F E T C H", width)
		tagline := lipgloss.NewStyle().
			Foreground(theme.TextSecondary).
			Italic(true).
			Align(lipgloss.Center).
			Width(width).
			Render("Your Faithful Code Companion")

		mainContent = lipgloss.JoinVertical(lipgloss.Left,
			compactTitle,
			tagline,
			"",
			actionMsg+menuPanel,
		)
	} else {
		// Standard/Wide: dog art + FETCH title side-by-side
		dogArt := components.Header(width, contentHeight, m.getStatusString())

		fetchTitle := lipgloss.NewStyle().
			Foreground(theme.Primary).
			Bold(true).
			Render("███████╗███████╗████████╗ ██████╗██╗  ██╗\n" +
				"██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║\n" +
				"█████╗  █████╗     ██║   ██║     ███████║\n" +
				"██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║\n" +
				"██║     ███████╗   ██║   ╚██████╗██║  ██║\n" +
				"╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝")

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

		mainContent = lipgloss.JoinHorizontal(lipgloss.Top,
			dogArt,
			"    ",
			rightContent,
		)
	}

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
	// Update badges with live state
	m.buildMenuBadges()

	// Menu title
	menuTitle := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.Secondary).
		Background(theme.Surface).
		Padding(0, 1).
		Render("✨ Main Menu ✨")

	return "  " + menuTitle + "\n" + m.mainMenu.ViewCompact()
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

	return layout.ScreenLayout{
		Title:      "ℹ️  Version",
		Content:    components.Version(m.versionInfo, width, height-6),
		HelpKeys:   []string{"Esc Back"},
		Breadcrumb: []string{"Main Menu", "Version"},
		Width:      width,
		Height:     height,
	}.Render()
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

	var title string
	var content string
	var helpKeys []string
	var breadcrumb []string

	switch m.configMode {
	case 0: // Settings Sub-menu
		title = "\u2699\ufe0f  Settings"
		if m.settingsMenu != nil {
			// Update badges for sub-menu if needed (specifically Harnesses)
			sItems := m.settingsMenu.Items
			// Harness auth badge on "Harnesses" item (index 1)
			settingsAuthCount := 0
			for _, hs := range m.harnessStatuses {
				if hs.authed {
					settingsAuthCount++
				}
			}
			if settingsAuthCount > 0 {
				sItems[1].Badge = fmt.Sprintf("[%d/%d auth]", settingsAuthCount, len(m.harnessStatuses))
			} else {
				sItems[1].Badge = ""
			}
			m.settingsMenu.Items = sItems
			content = "\n" + m.settingsMenu.ViewCompact()
		}
		helpKeys = []string{"↑/↓ Navigate", "Enter Select", "Esc Back"}
		breadcrumb = []string{"Main Menu", "Settings"}

	case 2: // Model picker overlay
		title = "🤖 Select Model"
		if m.modelSelector != nil {
			content = m.modelSelector.View()
		} else {
			content = theme.StatusInfo.Render("   Loading models...") + "\n"
		}
		helpKeys = []string{"↑/↓ Navigate", "Enter Select", "Tab Toggle", "Esc Back"}
		breadcrumb = []string{"Main Menu", "Settings", "Model Picker"}

	default: // Editor mode
		title = "\u2699\ufe0f  Settings"
		// Tab bar
		tabGeneral := "  General  "
		tabAdvanced := "  Advanced  "
		activeTabStyle := lipgloss.NewStyle().Bold(true).Foreground(theme.Primary).Background(theme.Surface).Padding(0, 1)
		inactiveTabStyle := lipgloss.NewStyle().Foreground(theme.TextMuted).Padding(0, 1)
		if m.configEditor != nil && m.configEditor.Mode() == config.ModeAdvanced {
			tabGeneral = inactiveTabStyle.Render(tabGeneral)
			tabAdvanced = activeTabStyle.Render(tabAdvanced)
		} else {
			tabGeneral = activeTabStyle.Render(tabGeneral)
			tabAdvanced = inactiveTabStyle.Render(tabAdvanced)
		}
		tabBar := "   " + tabGeneral + " " + tabAdvanced + "\n\n"

		if m.configEditor != nil {
			m.configEditor.SetSize(height - 10) // extra room for tab bar
			content = tabBar + m.configEditor.View()
		} else {
			content = tabBar
		}
		helpKeys = []string{"←/→ Tabs", "↑/↓ Navigate", "Enter Edit", "Tab Sections", "s Save", "Esc Back"}
		breadcrumb = []string{"Main Menu", "Settings"}
	}

	return layout.ScreenLayout{
		Title:      title,
		Content:    content,
		HelpKeys:   helpKeys,
		Breadcrumb: breadcrumb,
		Width:      width,
		Height:     height,
	}.Render()
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

	var content string
	if m.whitelistManager != nil {
		content = m.whitelistManager.View()
	}

	return layout.ScreenLayout{
		Title:      "🔐 Trusted Numbers",
		Content:    content,
		HelpKeys:   []string{"↑/↓ Navigate", "a Add", "d Delete", "r Refresh", "Esc Back"},
		Breadcrumb: []string{"Main Menu", "Settings", "Trusted Numbers"},
		Width:      width,
		Height:     height,
	}.Render()
}

func (m model) viewHarnessAuth() string {
	width := m.width
	if width == 0 {
		width = 80
	}
	height := m.height
	if height == 0 {
		height = 24
	}

	var content strings.Builder

	if m.harnessChecking {
		content.WriteString(theme.StatusInfo.Render("   Checking harness auth status...") + "\n\n")
	}

	// Summary line
	authCount := 0
	enabledCount := 0
	for _, hs := range m.harnessStatuses {
		if hs.authed {
			authCount++
		}
		if hs.enabled {
			enabledCount++
		}
	}
	content.WriteString(fmt.Sprintf("   %s\n\n",
		theme.Subtitle.Render(fmt.Sprintf("%d authenticated, %d enabled", authCount, enabledCount))))

	inputStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFFFF"))

	for i, hs := range m.harnessStatuses {
		// Cursor prefix
		prefix := "   "
		if i == m.harnessCursor {
			prefix = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true).Render(" ▸ ")
		}

		// Status indicator
		var statusBadge string
		if !hs.installed {
			statusBadge = lipgloss.NewStyle().Foreground(theme.TextMuted).Render("◌ Not Installed")
		} else if hs.authed {
			statusBadge = theme.StatusSuccess.Render("● Authenticated")
		} else {
			statusBadge = theme.StatusError.Render("○ Not Authenticated")
		}

		// Enable badge
		enableBadge := lipgloss.NewStyle().Foreground(theme.TextMuted).Render("✗ Disabled")
		if hs.enabled {
			enableBadge = theme.StatusSuccess.Render("✓ Enabled")
		}

		// Name styling
		var nameStyle lipgloss.Style
		if i == m.harnessCursor {
			nameStyle = lipgloss.NewStyle().Foreground(theme.Primary).Bold(true)
		} else {
			nameStyle = theme.Value
		}

		// Pad name to align badges
		paddedName := fmt.Sprintf("%-18s", hs.name)
		content.WriteString(fmt.Sprintf("%s%s %s  %s  %s\n", prefix, hs.icon, nameStyle.Render(paddedName), statusBadge, enableBadge))

		// Expanded detail for selected harness
		if i == m.harnessCursor {
			detailIndent := "      "
			if !hs.installed {
				content.WriteString(detailIndent + theme.Subtitle.Render("Install the CLI on the host to enable authentication") + "\n")
			} else {
				// Auth detail
				if hs.id == harnessGitHub && len(hs.ghAccounts) > 0 {
					for j, acct := range hs.ghAccounts {
						acctPrefix := detailIndent + "  "
						if j == hs.ghCursor {
							acctPrefix = detailIndent + lipgloss.NewStyle().Foreground(theme.Secondary).Render("› ")
						}
						badge := ""
						if acct.active {
							badge = theme.StatusSuccess.Render(" (active)")
						}
						content.WriteString(acctPrefix + theme.Value.Render(acct.user) + badge + "\n")
					}
				} else if hs.detail != "" {
					content.WriteString(detailIndent + theme.Subtitle.Render(hs.detail) + "\n")
				}

				// Config fields
				apiLabel := hs.apiLabel
				if apiLabel == "" {
					apiLabel = "API Key"
				}

				// API key field
				apiDisplay := lipgloss.NewStyle().Foreground(theme.TextMuted).Render("(not set)")
				if hs.apiKey != "" {
					apiDisplay = lipgloss.NewStyle().Foreground(theme.TextMuted).Render(strings.Repeat("•", min(len(hs.apiKey), 20)))
				}
				if m.harnessEditing && m.harnessEditField == "apikey" {
					apiDisplay = inputStyle.Render(m.harnessEditBuffer + "█")
				}
				content.WriteString(detailIndent + theme.Subtitle.Render(apiLabel+": ") + apiDisplay + "\n")

				// Model field
				modelDisplay := lipgloss.NewStyle().Foreground(theme.TextMuted).Render("(default)")
				if hs.model != "" {
					modelDisplay = theme.Value.Render(hs.model)
				}
				if m.harnessEditing && m.harnessEditField == "model" {
					modelDisplay = inputStyle.Render(m.harnessEditBuffer + "█")
				}
				content.WriteString(detailIndent + theme.Subtitle.Render("Model: ") + modelDisplay + "\n")
			}
		}
		content.WriteString("\n")
	}

	// Context-sensitive help keys
	var helpKeys []string
	if m.harnessEditing {
		helpKeys = []string{"Type to edit", "Enter Save", "Esc Cancel"}
	} else if len(m.harnessStatuses) > 0 && m.harnessCursor < len(m.harnessStatuses) {
		selected := m.harnessStatuses[m.harnessCursor]
		if selected.id == harnessGitHub && len(selected.ghAccounts) > 1 {
			helpKeys = []string{"↑/↓ Navigate", "←/→ Accounts", "e Enable", "a Token", "m Model", "l Add", "s Switch", "d Remove", "r Refresh", "Esc Back"}
		} else {
			helpKeys = []string{"↑/↓ Navigate", "e Enable", "a " + selected.apiLabel, "m Model", "l Login", "d Logout", "r Refresh", "Esc Back"}
		}
	} else {
		helpKeys = []string{"↑/↓ Navigate", "e Enable", "a API Key", "m Model", "l Login", "d Logout", "r Refresh", "Esc Back"}
	}

	return layout.ScreenLayout{
		Title:      "\U0001f436 Harnesses",
		Content:    content.String(),
		HelpKeys:   helpKeys,
		Breadcrumb: []string{"Main Menu", "Settings", "Harnesses"},
		Width:      width,
		Height:     height,
	}.Render()
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

	return layout.ScreenLayout{
		Title:      "ℹ️  System Status",
		Content:    content.String(),
		HelpKeys:   []string{"r Refresh", "Esc Back"},
		Breadcrumb: []string{"Main Menu", "Status"},
		Width:      width,
		Height:     height,
	}.Render()
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
				qrText := renderQRCodeCompact(*m.bridgeStatus.QRCode)
				content.WriteString(qrText + "\n")
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

	helpKeys := []string{"Esc Back"}
	if m.bridgeStatus != nil && m.bridgeStatus.State == "qr_pending" {
		helpKeys = []string{"o Open QR", "Esc Back"}
	}

	return layout.ScreenLayout{
		Title:      "📱 WhatsApp Setup",
		Content:    content.String(),
		HelpKeys:   helpKeys,
		Breadcrumb: []string{"Main Menu", "WhatsApp Setup"},
		Width:      width,
		Height:     height,
	}.Render()
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
