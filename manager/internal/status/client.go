// Package status provides a client for the Fetch Bridge status API.
package status

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	// DefaultStatusURL is the default bridge status API endpoint
	DefaultStatusURL = "http://localhost:8765/api/status"
	// RequestTimeout is the HTTP request timeout
	RequestTimeout = 5 * time.Second
)

// BridgeStatus represents the current state of the Fetch Bridge.
// It includes WhatsApp connection state, authentication info, and metrics.
type BridgeStatus struct {
	State        string  `json:"state"`        // initializing, qr_pending, authenticated, disconnected, error
	QRCode       *string `json:"qrCode"`       // Raw QR code data (if pending)
	QRUrl        *string `json:"qrUrl"`        // URL to view QR code image
	Uptime       int     `json:"uptime"`       // Seconds since start
	MessageCount int     `json:"messageCount"` // Total messages processed
	LastError    *string `json:"lastError"`    // Last error message (if any)
}

// SessionSummary represents a simplified session object for the list view
type SessionSummary struct {
	ID             string  `json:"id"`
	UserID         string  `json:"userId"`
	MessageCount   int     `json:"messageCount"`
	LastActivityAt string  `json:"lastActivityAt"`
	CreatedAt      string  `json:"createdAt"`
	ActiveProject  *string `json:"activeProject"`
}

// SessionListResponse represents the response from the list sessions endpoint
type SessionListResponse struct {
	Success  bool             `json:"success"`
	Sessions []SessionSummary `json:"sessions"`
	Message  string           `json:"message"`
}

// ActionResponse represents a generic success/message response
type ActionResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ToolCallRequest represents a requested tool call
type ToolCallRequest struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Message represents a single chat message
type Message struct {
	ID        string            `json:"id"`
	Role      string            `json:"role"`
	Content   string            `json:"content"`
	ToolCalls []ToolCallRequest `json:"toolCalls,omitempty"`
	Timestamp string            `json:"timestamp"`
}

// Session represents a full session with history
type Session struct {
	ID             string    `json:"id"`
	UserID         string    `json:"userId"`
	Messages       []Message `json:"messages"`
	LastActivityAt string    `json:"lastActivityAt"`
	CreatedAt      string    `json:"createdAt"`
}

// SessionDetailResponse represents the response from the get session endpoint
type SessionDetailResponse struct {
	Success bool    `json:"success"`
	Session Session `json:"session"`
	Message string  `json:"message"`
}

// Client provides HTTP access to the Fetch Bridge status and control APIs.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new status client
func NewClient() *Client {
	return &Client{
		baseURL: DefaultStatusURL,
		httpClient: &http.Client{
			Timeout: RequestTimeout,
		},
	}
}

// GetStatus fetches the current bridge status
func (c *Client) GetStatus() (*BridgeStatus, error) {
	resp, err := c.httpClient.Get(c.baseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to bridge: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var status BridgeStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &status, nil
}

// StateEmoji returns an emoji for the current state
func (s *BridgeStatus) StateEmoji() string {
	switch s.State {
	case "initializing":
		return "⏳"
	case "qr_pending":
		return "📱"
	case "authenticated":
		return "✅"
	case "disconnected":
		return "📴"
	case "error":
		return "❌"
	default:
		return "❓"
	}
}

// StateDescription returns a human-readable state description
func (s *BridgeStatus) StateDescription() string {
	switch s.State {
	case "initializing":
		return "Starting up..."
	case "qr_pending":
		return "Waiting for QR scan"
	case "authenticated":
		return "Connected to WhatsApp"
	case "disconnected":
		return "Disconnected"
	case "error":
		if s.LastError != nil {
			return fmt.Sprintf("Error: %s", *s.LastError)
		}
		return "Error"
	default:
		return "Unknown state"
	}
}

// FormatUptime returns a human-readable uptime string
func (s *BridgeStatus) FormatUptime() string {
	hours := s.Uptime / 3600
	minutes := (s.Uptime % 3600) / 60
	seconds := s.Uptime % 60

	if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, minutes, seconds)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}

// ConfigReloadResponse represents the response from the config reload endpoint.
type ConfigReloadResponse struct {
	Success     bool     `json:"success"`
	UpdatedKeys []string `json:"updatedKeys"`
	Message     string   `json:"message"`
}

// ReloadConfig triggers a hot-reload of the .env configuration in the running bridge.
// It sends a POST request to /api/config/reload with the admin token for authentication.
func (c *Client) ReloadConfig(adminToken string) (*ConfigReloadResponse, error) {
	// Derive base URL from status URL: http://localhost:8765/api/status -> http://localhost:8765
	baseURL := strings.TrimSuffix(c.baseURL, "/api/status")

	req, err := http.NewRequest("POST", baseURL+"/api/config/reload", bytes.NewReader(nil))
	if err != nil {
		return nil, fmt.Errorf("failed to create reload request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to bridge for reload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("unauthorized: invalid admin token")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("reload failed with status code: %d", resp.StatusCode)
	}

	var result ConfigReloadResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode reload response: %w", err)
	}

	return &result, nil
}

// ListSessions fetches the list of active sessions from the bridge.
func (c *Client) ListSessions(adminToken string) ([]SessionSummary, error) {
	baseURL := strings.TrimSuffix(c.baseURL, "/api/status")

	req, err := http.NewRequest("GET", baseURL+"/api/sessions", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create list sessions request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to bridge: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to list sessions: status %d", resp.StatusCode)
	}

	var result SessionListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode sessions response: %w", err)
	}

	return result.Sessions, nil
}

// GetSession fetches the full details of a specific session.
func (c *Client) GetSession(adminToken, id string) (*Session, error) {
	baseURL := strings.TrimSuffix(c.baseURL, "/api/status")

	req, err := http.NewRequest("GET", baseURL+"/api/sessions/"+id, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create get session request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to bridge: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("unauthorized: invalid admin token")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get session: status %d", resp.StatusCode)
	}

	var result SessionDetailResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode session response: %w", err)
	}

	return &result.Session, nil
}

// DeleteSession deletes a session by ID.
func (c *Client) DeleteSession(adminToken, sessionID string) error {
	baseURL := strings.TrimSuffix(c.baseURL, "/api/status")

	req, err := http.NewRequest("DELETE", baseURL+"/api/sessions/"+sessionID, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to bridge: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to delete session: status %d", resp.StatusCode)
	}

	return nil
}

// ClearSession clears message history for a session by ID.
func (c *Client) ClearSession(adminToken, sessionID string) error {
	baseURL := strings.TrimSuffix(c.baseURL, "/api/status")

	req, err := http.NewRequest("POST", baseURL+"/api/sessions/"+sessionID+"/clear", nil)
	if err != nil {
		return fmt.Errorf("failed to create clear request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to bridge: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to clear session: status %d", resp.StatusCode)
	}

	return nil
}
