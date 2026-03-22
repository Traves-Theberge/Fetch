package components

import "testing"

func TestBoolToOnOff(t *testing.T) {
	if got := boolToOnOff(true); got != "ON" {
		t.Errorf("boolToOnOff(true) = %q, want ON", got)
	}
	if got := boolToOnOff(false); got != "OFF" {
		t.Errorf("boolToOnOff(false) = %q, want OFF", got)
	}
}

func TestWrapText_ShortText(t *testing.T) {
	result := wrapText("short", 80)
	if result != "short" {
		t.Errorf("wrapText short text = %q, want %q", result, "short")
	}
}

func TestWrapText_ZeroWidth(t *testing.T) {
	result := wrapText("some text", 0)
	if result != "some text" {
		t.Errorf("wrapText zero width = %q, want %q", result, "some text")
	}
}

func TestWrapText_Wrapping(t *testing.T) {
	// "hello world foo" with width 12 should wrap
	result := wrapText("hello world foo bar", 12)
	if result == "hello world foo bar" {
		t.Error("expected text to be wrapped but got original")
	}
	// First word should be at the start
	if len(result) < 5 || result[:5] != "hello" {
		t.Errorf("expected result to start with 'hello', got %q", result)
	}
}

func TestRepeat(t *testing.T) {
	tests := []struct {
		s    string
		n    int
		want string
	}{
		{"a", 3, "aaa"},
		{"ab", 2, "abab"},
		{"x", 0, ""},
		{"", 5, ""},
	}

	for _, tt := range tests {
		if got := repeat(tt.s, tt.n); got != tt.want {
			t.Errorf("repeat(%q, %d) = %q, want %q", tt.s, tt.n, got, tt.want)
		}
	}
}
