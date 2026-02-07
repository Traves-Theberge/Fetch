// Package models provides OpenRouter model selection UI.
package models

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FF6B35"))

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00ff00")).
			Bold(true)

	normalStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#cccccc"))

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#666666"))

	categoryStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00bfff")).
			Bold(true).
			MarginTop(1)

	priceStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888"))

	currentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFD700")).
			Bold(true)

	ctxStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#9B59B6"))

	modalityStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#E67E22"))

	toolsBadgeStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#2ECC71")).
			Bold(true)
)

// SelectionState represents the current state of the model selection UI.
type SelectionState int

const (
	// StateLoading indicates models are being fetched from the API.
	StateLoading SelectionState = iota
	// StateLoaded indicates models have been successfully loaded.
	StateLoaded
	// StateError indicates an error occurred while loading models.
	StateError
	// StateSaving indicates the selected model is being saved.
	StateSaving
	// StateSaved indicates the model was successfully saved.
	StateSaved
)

// Selector handles the OpenRouter model selection UI.
// It displays models grouped by category with search and filtering capabilities.
type Selector struct {
	state        SelectionState
	models       []Model
	categories   []Category
	flatList     []listItem // Flattened list for navigation
	cursor       int
	currentModel string
	errorMessage string
	width        int
	height       int
	showAll      bool // Show all models or just recommended
}

// listItem represents an item in the flattened model list.
type listItem struct {
	isCategory bool
	category   string
	model      Model
}

// ModelsLoadedMsg is sent when models are fetched from the OpenRouter API.
type ModelsLoadedMsg struct {
	Models []Model
	Err    error
}

// ModelSavedMsg is sent when a model selection is saved to configuration.
type ModelSavedMsg struct {
	Err error
}

// NewSelector creates a new model selector
func NewSelector() *Selector {
	return &Selector{
		state:        StateLoading,
		currentModel: GetCurrentModel(),
		showAll:      false,
	}
}

// FetchModelsCmd fetches models from OpenRouter
func FetchModelsCmd() tea.Msg {
	apiKey := GetAPIKey()
	if apiKey == "" {
		return ModelsLoadedMsg{Err: fmt.Errorf("OPENROUTER_API_KEY not configured")}
	}

	models, err := FetchModels(apiKey)
	return ModelsLoadedMsg{Models: models, Err: err}
}

// SaveModelCmd saves the selected model
func SaveModelCmd(modelID string) tea.Cmd {
	return func() tea.Msg {
		err := SaveModel(modelID)
		return ModelSavedMsg{Err: err}
	}
}

// Init initializes the selector
func (s *Selector) Init() tea.Cmd {
	return FetchModelsCmd
}

// Update handles messages
func (s *Selector) Update(msg tea.Msg) (*Selector, tea.Cmd) {
	switch msg := msg.(type) {
	case ModelsLoadedMsg:
		if msg.Err != nil {
			s.state = StateError
			s.errorMessage = msg.Err.Error()
			return s, nil
		}
		s.models = msg.Models
		s.rebuildList()
		s.state = StateLoaded
		// Move cursor to current model
		s.moveToCurrent()
		return s, nil

	case ModelSavedMsg:
		if msg.Err != nil {
			s.state = StateError
			s.errorMessage = msg.Err.Error()
		} else {
			s.state = StateSaved
		}
		return s, nil

	case tea.KeyMsg:
		return s.handleKey(msg)
	}

	return s, nil
}

func (s *Selector) handleKey(msg tea.KeyMsg) (*Selector, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		s.moveCursor(-1)
	case "down", "j":
		s.moveCursor(1)
	case "tab":
		// Toggle between recommended and all models
		s.showAll = !s.showAll
		s.rebuildList()
	case "enter", " ":
		if s.state == StateLoaded && s.cursor < len(s.flatList) {
			item := s.flatList[s.cursor]
			if !item.isCategory {
				s.currentModel = item.model.ID
				s.state = StateSaving
				return s, SaveModelCmd(item.model.ID)
			}
		}
	}
	return s, nil
}

func (s *Selector) moveCursor(delta int) {
	newCursor := s.cursor + delta

	// Skip category headers
	for newCursor >= 0 && newCursor < len(s.flatList) {
		if !s.flatList[newCursor].isCategory {
			break
		}
		newCursor += delta
	}

	if newCursor >= 0 && newCursor < len(s.flatList) {
		s.cursor = newCursor
	}
}

func (s *Selector) moveToCurrent() {
	for i, item := range s.flatList {
		if !item.isCategory && item.model.ID == s.currentModel {
			s.cursor = i
			return
		}
	}
}

func (s *Selector) rebuildList() {
	s.flatList = nil

	var modelsToShow []Model
	if s.showAll {
		modelsToShow = s.models
	} else {
		modelsToShow = FilterToolCapable(s.models)
	}

	categories := GroupByProvider(modelsToShow)

	for _, cat := range categories {
		// Add category header
		s.flatList = append(s.flatList, listItem{
			isCategory: true,
			category:   cat.Name,
		})
		// Add models
		for _, m := range cat.Models {
			s.flatList = append(s.flatList, listItem{
				isCategory: false,
				model:      m,
			})
		}
	}

	// Ensure cursor is valid
	if s.cursor >= len(s.flatList) {
		s.cursor = 0
	}
	// Skip to first model if on category
	if len(s.flatList) > 0 && s.flatList[s.cursor].isCategory {
		s.moveCursor(1)
	}
}

// View renders the selector
func (s *Selector) View() string {
	var b strings.Builder

	// Title
	b.WriteString(titleStyle.Render("🤖 Select AI Model"))
	b.WriteString("\n")
	b.WriteString(dimStyle.Render(fmt.Sprintf("Current: %s", s.currentModel)))
	b.WriteString("\n\n")

	switch s.state {
	case StateLoading:
		b.WriteString("⏳ Loading models from OpenRouter...")

	case StateError:
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#ff0000")).Render("❌ " + s.errorMessage))

	case StateSaving:
		b.WriteString("💾 Saving model selection...")

	case StateSaved:
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff00")).Render("✅ Model saved! Restart Fetch to apply."))

	case StateLoaded:
		// Show toggle hint
		if s.showAll {
			b.WriteString(dimStyle.Render("Showing all models • Tab: show tool-capable only"))
		} else {
			b.WriteString(dimStyle.Render("Showing tool-capable (🔧) • Tab: show all"))
		}
		b.WriteString("\n")
		b.WriteString(dimStyle.Render("↑/↓ navigate • Enter select • Esc back"))
		b.WriteString("\n\n")

		// Calculate visible range (simple scrolling)
		visibleStart := 0
		visibleEnd := len(s.flatList)
		maxVisible := 20
		if len(s.flatList) > maxVisible {
			visibleStart = s.cursor - maxVisible/2
			if visibleStart < 0 {
				visibleStart = 0
			}
			visibleEnd = visibleStart + maxVisible
			if visibleEnd > len(s.flatList) {
				visibleEnd = len(s.flatList)
				visibleStart = visibleEnd - maxVisible
			}
		}

		for i := visibleStart; i < visibleEnd; i++ {
			item := s.flatList[i]

			if item.isCategory {
				b.WriteString(categoryStyle.Render("─── " + item.category + " ───"))
				b.WriteString("\n")
				continue
			}

			// Model line
			prefix := "  "
			style := normalStyle
			if i == s.cursor {
				prefix = "▸ "
				style = selectedStyle
			}

			isCurrent := item.model.ID == s.currentModel
			modelName := item.model.ID
			if isCurrent {
				modelName += " ★"
				if i != s.cursor {
					style = currentStyle
				}
			}

			// Context window
			ctx := ctxStyle.Render(FormatContextLength(item.model.ContextLength))

			// Format pricing (per million tokens)
			promptPrice := FormatPrice(item.model.Pricing.Prompt)
			price := priceStyle.Render(promptPrice)

			// Modality badges
			modality := FormatModality(item.model)
			if modality != "" {
				modality = modalityStyle.Render(modality)
			}

			// Tools badge
			tools := ""
			if HasTools(item.model) {
				tools = toolsBadgeStyle.Render("🔧")
			}

			// Build the line: prefix modelName | ctx | price | modalities | tools
			b.WriteString(prefix)
			b.WriteString(style.Render(modelName))
			b.WriteString(dimStyle.Render(" │ "))
			b.WriteString(ctx)
			b.WriteString(dimStyle.Render(" │ "))
			b.WriteString(price)
			if modality != "" {
				b.WriteString(dimStyle.Render(" │ "))
				b.WriteString(modality)
			}
			if tools != "" {
				b.WriteString(" ")
				b.WriteString(tools)
			}
			b.WriteString("\n")
		}
	}

	return b.String()
}

// IsDone returns true if selection is complete
func (s *Selector) IsDone() bool {
	return s.state == StateSaved
}

// HasError returns true if there was an error
func (s *Selector) HasError() bool {
	return s.state == StateError
}

// SelectedModel returns the currently selected model ID
func (s *Selector) SelectedModel() string {
	return s.currentModel
}
