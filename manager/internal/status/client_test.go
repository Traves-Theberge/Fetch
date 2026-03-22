package status

import "testing"

func TestStateEmoji(t *testing.T) {
	tests := []struct {
		state string
		want  string
	}{
		{"initializing", "⏳"},
		{"qr_pending", "📱"},
		{"authenticated", "✅"},
		{"disconnected", "📴"},
		{"error", "❌"},
		{"unknown_state", "❓"},
		{"", "❓"},
	}

	for _, tt := range tests {
		t.Run(tt.state, func(t *testing.T) {
			s := &BridgeStatus{State: tt.state}
			if got := s.StateEmoji(); got != tt.want {
				t.Errorf("StateEmoji() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestStateDescription(t *testing.T) {
	errMsg := "connection refused"

	tests := []struct {
		name  string
		state BridgeStatus
		want  string
	}{
		{"initializing", BridgeStatus{State: "initializing"}, "Starting up..."},
		{"qr_pending", BridgeStatus{State: "qr_pending"}, "Waiting for QR scan"},
		{"authenticated", BridgeStatus{State: "authenticated"}, "Connected to WhatsApp"},
		{"disconnected", BridgeStatus{State: "disconnected"}, "Disconnected"},
		{"error_with_msg", BridgeStatus{State: "error", LastError: &errMsg}, "Error: connection refused"},
		{"error_no_msg", BridgeStatus{State: "error"}, "Error"},
		{"unknown", BridgeStatus{State: "foo"}, "Unknown state"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.state.StateDescription(); got != tt.want {
				t.Errorf("StateDescription() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFormatUptime(t *testing.T) {
	tests := []struct {
		name   string
		uptime int
		want   string
	}{
		{"zero", 0, "0s"},
		{"seconds_only", 45, "45s"},
		{"minutes_and_seconds", 125, "2m 5s"},
		{"hours_minutes_seconds", 3661, "1h 1m 1s"},
		{"exact_hour", 3600, "1h 0m 0s"},
		{"exact_minute", 60, "1m 0s"},
		{"large_uptime", 90061, "25h 1m 1s"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &BridgeStatus{Uptime: tt.uptime}
			if got := s.FormatUptime(); got != tt.want {
				t.Errorf("FormatUptime() = %q, want %q", got, tt.want)
			}
		})
	}
}
