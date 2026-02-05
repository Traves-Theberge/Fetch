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
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	ContextLength int     `json:"context_length"`
	Pricing       Pricing `json:"pricing"`
}

// Pricing contains the per-token cost information for prompt and completion.
type Pricing struct {
	Prompt     string `json:"prompt"`
	Completion string `json:"completion"`
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

// FilterRecommended returns models suitable for agentic use (good reasoning, affordable)
func FilterRecommended(models []Model) []Model {
	recommended := []string{
		"openai/gpt-4o-mini",
		"openai/gpt-4o",
		"openai/o3-mini",
		"anthropic/claude-sonnet-4",
		"anthropic/claude-3.5-haiku",
		"google/gemini-2.0-flash",
		"google/gemini-2.5-pro-preview",
		"meta-llama/llama-3.3-70b-instruct",
		"mistralai/mistral-large",
		"mistralai/mistral-small",
		"deepseek/deepseek-chat-v3",
		"deepseek/deepseek-r1",
		"qwen/qwen-2.5-72b-instruct",
	}

	recommendedSet := make(map[string]bool)
	for _, id := range recommended {
		recommendedSet[id] = true
	}

	var filtered []Model
	for _, m := range models {
		if recommendedSet[m.ID] {
			filtered = append(filtered, m)
		}
	}

	return filtered
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

// FormatPrice formats pricing string for display
func FormatPrice(priceStr string) string {
	if priceStr == "" || priceStr == "0" {
		return "Free"
	}
	return "$" + priceStr + "/1K"
}
