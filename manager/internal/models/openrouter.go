// Package models provides OpenRouter model fetching and selection.
package models

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/fetch/manager/internal/paths"
)

// Model represents an OpenRouter AI model with metadata and pricing.
type Model struct {
	ID                  string       `json:"id"`
	Name                string       `json:"name"`
	Description         string       `json:"description"`
	ContextLength       int          `json:"context_length"`
	Pricing             Pricing      `json:"pricing"`
	Architecture        Architecture `json:"architecture"`
	SupportedParameters []string     `json:"supported_parameters"`
}

// Pricing contains the per-token cost information for prompt and completion.
type Pricing struct {
	Prompt     string `json:"prompt"`
	Completion string `json:"completion"`
}

// Architecture describes the model's modality, tokenizer, and instruction type.
type Architecture struct {
	Modality         string   `json:"modality"`
	InputModalities  []string `json:"input_modalities"`
	OutputModalities []string `json:"output_modalities"`
	Tokenizer        string   `json:"tokenizer"`
}

// ModelsResponse represents the OpenRouter API response structure.
type ModelsResponse struct {
	Data []Model `json:"data"`
}

// Category groups models by provider for display organization.
type Category struct {
	Name   string
	Models []Model
}

// FetchModels retrieves available models from OpenRouter
func FetchModels(apiKey string) ([]Model, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("GET", "https://openrouter.ai/api/v1/models", nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var modelsResp ModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&modelsResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return modelsResp.Data, nil
}

// FilterToolCapable returns only models that support function calling (tools).
func FilterToolCapable(models []Model) []Model {
	var filtered []Model
	for _, m := range models {
		for _, p := range m.SupportedParameters {
			if p == "tools" {
				filtered = append(filtered, m)
				break
			}
		}
	}
	return filtered
}

// HasTools returns whether a model supports function calling (tools).
func HasTools(m Model) bool {
	for _, p := range m.SupportedParameters {
		if p == "tools" {
			return true
		}
	}
	return false
}

// GroupByProvider groups models by their provider
func GroupByProvider(models []Model) []Category {
	providerMap := make(map[string][]Model)

	for _, m := range models {
		parts := strings.SplitN(m.ID, "/", 2)
		provider := "Other"
		if len(parts) == 2 {
			// Capitalize first letter
			p := parts[0]
			if len(p) > 0 {
				provider = strings.ToUpper(p[:1]) + p[1:]
			}
		}
		providerMap[provider] = append(providerMap[provider], m)
	}

	// Sort providers
	var providers []string
	for p := range providerMap {
		providers = append(providers, p)
	}
	sort.Strings(providers)

	var categories []Category
	for _, p := range providers {
		categories = append(categories, Category{
			Name:   p,
			Models: providerMap[p],
		})
	}

	return categories
}

// GetCurrentModel reads the current AGENT_MODEL from .env
func GetCurrentModel() string {
	file, err := os.Open(paths.EnvFile)
	if err != nil {
		return "openai/gpt-4o-mini" // Default
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "AGENT_MODEL=") {
			return strings.TrimPrefix(line, "AGENT_MODEL=")
		}
	}

	return "openai/gpt-4o-mini" // Default
}

// SaveModel saves the selected model to .env file
func SaveModel(modelID string) error {
	// Read existing .env
	content, err := os.ReadFile(paths.EnvFile)
	if err != nil {
		return fmt.Errorf("reading .env: %w", err)
	}

	lines := strings.Split(string(content), "\n")
	found := false
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "AGENT_MODEL=") {
			lines[i] = "AGENT_MODEL=" + modelID
			found = true
			break
		}
	}

	if !found {
		// Add after OPENROUTER_API_KEY section or at end
		insertIdx := len(lines)
		for i, line := range lines {
			if strings.HasPrefix(strings.TrimSpace(line), "OPENROUTER_API_KEY=") {
				insertIdx = i + 1
				break
			}
		}
		// Insert AGENT_MODEL
		newLines := make([]string, 0, len(lines)+2)
		newLines = append(newLines, lines[:insertIdx]...)
		newLines = append(newLines, "AGENT_MODEL="+modelID)
		newLines = append(newLines, lines[insertIdx:]...)
		lines = newLines
	}

	return os.WriteFile(paths.EnvFile, []byte(strings.Join(lines, "\n")), 0644)
}

// GetAPIKey reads OPENROUTER_API_KEY from .env
func GetAPIKey() string {
	file, err := os.Open(paths.EnvFile)
	if err != nil {
		return ""
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "OPENROUTER_API_KEY=") {
			return strings.TrimPrefix(line, "OPENROUTER_API_KEY=")
		}
	}

	return ""
}

// FormatPrice formats a per-token price string as a readable per-million-token cost.
func FormatPrice(priceStr string) string {
	if priceStr == "" || priceStr == "0" || priceStr == "-1" {
		return "Free"
	}
	// Price from API is per-token; multiply by 1,000,000 for per-M display
	var perToken float64
	if _, err := fmt.Sscanf(priceStr, "%f", &perToken); err != nil {
		return priceStr
	}
	perMillion := perToken * 1_000_000
	if perMillion < 0.01 {
		return "Free"
	}
	if perMillion < 1.0 {
		return fmt.Sprintf("$%.2f/M", perMillion)
	}
	if perMillion < 10.0 {
		return fmt.Sprintf("$%.1f/M", perMillion)
	}
	return fmt.Sprintf("$%.0f/M", perMillion)
}

// FormatContextLength formats a context length integer as a human-readable string.
func FormatContextLength(ctx int) string {
	if ctx >= 1_000_000 {
		m := float64(ctx) / 1_000_000
		if m == float64(int(m)) {
			return fmt.Sprintf("%dM", int(m))
		}
		return fmt.Sprintf("%.1fM", m)
	}
	if ctx >= 1_000 {
		k := float64(ctx) / 1_000
		if k == float64(int(k)) {
			return fmt.Sprintf("%dK", int(k))
		}
		return fmt.Sprintf("%.1fK", k)
	}
	return fmt.Sprintf("%d", ctx)
}

// FormatModality returns emoji badges for model input/output modalities.
func FormatModality(m Model) string {
	badges := ""
	inputSet := make(map[string]bool)
	for _, mod := range m.Architecture.InputModalities {
		inputSet[mod] = true
	}
	outputSet := make(map[string]bool)
	for _, mod := range m.Architecture.OutputModalities {
		outputSet[mod] = true
	}

	// Input modalities
	if inputSet["image"] {
		badges += "👁 "
	}
	if inputSet["audio"] {
		badges += "🎤 "
	}
	if inputSet["video"] {
		badges += "🎬 "
	}
	if inputSet["file"] {
		badges += "📎 "
	}

	// Output modalities
	if outputSet["image"] {
		badges += "🖼 "
	}
	if outputSet["audio"] {
		badges += "🔊 "
	}

	return strings.TrimSpace(badges)
}
