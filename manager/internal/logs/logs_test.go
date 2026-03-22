package logs

import "testing"

func TestParseLogLine_TimestampAndLevel(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantLevel string
		wantMsg   string
	}{
		{"debug_emoji", "12:30:45 🔍 Some debug info", "DEBUG", "Some debug info"},
		{"info_emoji", "12:30:45 📘 Server started", "INFO", "Server started"},
		{"warn_emoji", "12:30:45 ⚠️ Low memory", "WARN", "Low memory"},
		{"error_emoji", "12:30:45 ❌ Connection failed", "ERROR", "Connection failed"},
		{"success_emoji", "12:30:45 ✅ Ready to go", "SUCCESS", "Ready to go"},
		{"debug_text", "12:30:45 DEBUG Verbose output", "DEBUG", "Verbose output"},
		{"info_text", "12:30:45 INFO Normal log", "INFO", "Normal log"},
		{"warn_text", "12:30:45 WARN Watch out", "WARN", "Watch out"},
		{"warning_text", "12:30:45 WARNING Something wrong", "WARN", "Something wrong"},
		{"error_text", "12:30:45 ERROR Bad things", "ERROR", "Bad things"},
		{"err_text", "12:30:45 ERR Something broke", "ERROR", "Something broke"},
		{"ok_text", "12:30:45 OK All good", "SUCCESS", "All good"},
		{"success_text", "12:30:45 SUCCESS Done", "SUCCESS", "Done"},
		{"msg_emoji", "12:30:45 💬 User message", "INFO", "User message"},
		{"msg_text", "12:30:45 MSG Incoming", "INFO", "Incoming"},
		{"no_level", "12:30:45 Just some text here", "INFO", "Just some text here"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := ParseLogLine(tt.line, "bridge")
			if entry.Level != tt.wantLevel {
				t.Errorf("Level = %q, want %q", entry.Level, tt.wantLevel)
			}
			if entry.Message != tt.wantMsg {
				t.Errorf("Message = %q, want %q", entry.Message, tt.wantMsg)
			}
			if entry.Source != "bridge" {
				t.Errorf("Source = %q, want %q", entry.Source, "bridge")
			}
			if entry.Raw != tt.line {
				t.Errorf("Raw = %q, want %q", entry.Raw, tt.line)
			}
		})
	}
}

func TestParseLogLine_ErrorDetection(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantLevel string
	}{
		{"error_in_message", "Something error happened", "ERROR"},
		{"failed_in_message", "Request failed badly", "ERROR"},
		{"warn_in_message", "This is a warning sign", "WARN"},
		{"warning_in_message", "warning: deprecated", "WARN"},
		{"success_in_message", "Operation success", "SUCCESS"},
		{"ready_in_message", "Server is ready", "SUCCESS"},
		{"plain_message", "Just a normal log line", "INFO"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := ParseLogLine(tt.line, "test")
			if entry.Level != tt.wantLevel {
				t.Errorf("Level = %q, want %q", entry.Level, tt.wantLevel)
			}
		})
	}
}

func TestParseLogLine_NoTimestamp(t *testing.T) {
	entry := ParseLogLine("no timestamp here", "kennel")
	if entry.Level != "INFO" {
		t.Errorf("expected INFO for plain text, got %q", entry.Level)
	}
	if entry.Message != "no timestamp here" {
		t.Errorf("Message = %q, want %q", entry.Message, "no timestamp here")
	}
}

func TestParseLogLine_TimestampOnly(t *testing.T) {
	entry := ParseLogLine("12:30:45 hello", "test")
	// "12:30:45 hello" - parts[0]="12:30:45", parts[1]="hello", no parts[2]
	// "hello" doesn't match any level, so message = "hello"
	if entry.Message != "hello" {
		t.Errorf("Message = %q, want %q", entry.Message, "hello")
	}
}
