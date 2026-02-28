// Package logs provides Docker container log retrieval for Fetch services.
//
// This package handles fetching, parsing, and formatting logs from Docker containers.
// It supports real-time log streaming and historical log retrieval.
package logs

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/fetch/manager/internal/components"
)

// GetRecentLogs retrieves recent logs from a Docker container.
//
// Returns the full log lines without truncation. The log viewer handles
// wrapping and display formatting.
//
// Parameters:
//   - container: Docker container name (e.g., "fetch-bridge")
//   - lines: Number of recent lines to fetch
//
// Returns a slice of raw log strings.
func GetRecentLogs(container string, lines int) []string {
	cmd := exec.Command("docker", "logs", "--tail", fmt.Sprintf("%d", lines), container)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return []string{fmt.Sprintf("❌ Error fetching logs: %v", err)}
	}

	var result []string
	for _, line := range strings.Split(string(out), "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			// Don't truncate - the log viewer handles wrapping
			result = append(result, trimmed)
		}
	}
	return result
}

// ParseLogLine parses a raw log line into a structured LogEntry.
//
// Expected formats:
//   - "HH:MM:SS LEVEL Message..." (Fetch Bridge format)
//   - "HH:MM:SS ICON Message..." (Emoji-prefixed format)
//   - "YYYY-MM-DD HH:MM:SS Message..." (Standard format)
//   - Any other text (treated as message with current time)
//
// Parameters:
//   - line: Raw log line text
//   - source: Source component name for the entry
//
// Returns a parsed LogEntry.
func ParseLogLine(line string, source string) components.LogEntry {
	entry := components.LogEntry{
		Timestamp: time.Now(),
		Level:     "INFO",
		Source:    source,
		Message:   line,
		Raw:       line,
	}

	// Try to parse timestamp and level from common formats
	parts := strings.SplitN(line, " ", 3)
	if len(parts) >= 2 {
		// Check if first part looks like a timestamp (HH:MM:SS)
		if len(parts[0]) == 8 && strings.Count(parts[0], ":") == 2 {
			if t, err := time.Parse("15:04:05", parts[0]); err == nil {
				entry.Timestamp = time.Date(
					time.Now().Year(), time.Now().Month(), time.Now().Day(),
					t.Hour(), t.Minute(), t.Second(), 0, time.Local)

				// Check for level indicator (emoji or text)
				levelPart := parts[1]
				remaining := ""
				if len(parts) > 2 {
					remaining = parts[2]
				}

				switch levelPart {
				case "🔍", "DEBUG":
					entry.Level = "DEBUG"
					entry.Message = remaining
				case "📘", "INFO":
					entry.Level = "INFO"
					entry.Message = remaining
				case "⚠️", "WARN", "WARNING":
					entry.Level = "WARN"
					entry.Message = remaining
				case "❌", "ERROR", "ERR":
					entry.Level = "ERROR"
					entry.Message = remaining
				case "✅", "OK", "SUCCESS":
					entry.Level = "SUCCESS"
					entry.Message = remaining
				case "💬", "MSG":
					entry.Level = "INFO"
					entry.Message = remaining
				default:
					// No level indicator, use rest as message
					if remaining != "" {
						entry.Message = levelPart + " " + remaining
					} else {
						entry.Message = levelPart
					}
				}
			}
		}
	}

	// Detect error patterns in message
	lowerMsg := strings.ToLower(entry.Message)
	if entry.Level == "INFO" {
		if strings.Contains(lowerMsg, "error") || strings.Contains(lowerMsg, "failed") {
			entry.Level = "ERROR"
		} else if strings.Contains(lowerMsg, "warn") || strings.Contains(lowerMsg, "warning") {
			entry.Level = "WARN"
		} else if strings.Contains(lowerMsg, "success") || strings.Contains(lowerMsg, "ready") {
			entry.Level = "SUCCESS"
		}
	}

	return entry
}

