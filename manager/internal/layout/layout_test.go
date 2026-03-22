package layout

import "testing"

func TestIsCompact(t *testing.T) {
	tests := []struct {
		width int
		want  bool
	}{
		{0, true},
		{59, true},
		{60, false},
		{61, false},
		{120, false},
	}

	for _, tt := range tests {
		if got := IsCompact(tt.width); got != tt.want {
			t.Errorf("IsCompact(%d) = %v, want %v", tt.width, got, tt.want)
		}
	}
}

func TestBreakpointCompact(t *testing.T) {
	if BreakpointCompact != 60 {
		t.Errorf("BreakpointCompact = %d, want 60", BreakpointCompact)
	}
}
