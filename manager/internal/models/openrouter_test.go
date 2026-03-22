package models

import "testing"

func TestHasTools(t *testing.T) {
	tests := []struct {
		name   string
		params []string
		want   bool
	}{
		{"with_tools", []string{"temperature", "tools", "top_p"}, true},
		{"without_tools", []string{"temperature", "top_p"}, false},
		{"empty", nil, false},
		{"tools_only", []string{"tools"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := Model{SupportedParameters: tt.params}
			if got := HasTools(m); got != tt.want {
				t.Errorf("HasTools() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFilterToolCapable(t *testing.T) {
	models := []Model{
		{ID: "a", SupportedParameters: []string{"tools", "temperature"}},
		{ID: "b", SupportedParameters: []string{"temperature"}},
		{ID: "c", SupportedParameters: []string{"tools"}},
		{ID: "d", SupportedParameters: nil},
	}

	filtered := FilterToolCapable(models)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 tool-capable models, got %d", len(filtered))
	}
	if filtered[0].ID != "a" || filtered[1].ID != "c" {
		t.Errorf("unexpected filtered models: %v, %v", filtered[0].ID, filtered[1].ID)
	}
}

func TestFilterToolCapable_Empty(t *testing.T) {
	filtered := FilterToolCapable(nil)
	if filtered != nil {
		t.Errorf("expected nil for empty input, got %v", filtered)
	}
}

func TestGroupByProvider(t *testing.T) {
	models := []Model{
		{ID: "openai/gpt-4"},
		{ID: "openai/gpt-3.5"},
		{ID: "anthropic/claude-3"},
		{ID: "no-slash-model"},
	}

	categories := GroupByProvider(models)

	// Should have 3 categories: Anthropic, Openai, Other (sorted)
	if len(categories) != 3 {
		t.Fatalf("expected 3 categories, got %d", len(categories))
	}

	if categories[0].Name != "Anthropic" {
		t.Errorf("first category = %q, want Anthropic", categories[0].Name)
	}
	if len(categories[0].Models) != 1 {
		t.Errorf("Anthropic model count = %d, want 1", len(categories[0].Models))
	}

	if categories[1].Name != "Openai" {
		t.Errorf("second category = %q, want Openai", categories[1].Name)
	}
	if len(categories[1].Models) != 2 {
		t.Errorf("Openai model count = %d, want 2", len(categories[1].Models))
	}

	if categories[2].Name != "Other" {
		t.Errorf("third category = %q, want Other", categories[2].Name)
	}
}

func TestFormatPrice(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"empty", "", "Free"},
		{"zero", "0", "Free"},
		{"negative", "-1", "Free"},
		{"very_small", "0.000000001", "Free"},
		{"sub_dollar", "0.0000005", "$0.50/M"},
		{"dollar_range", "0.000003", "$3.0/M"},
		{"ten_plus", "0.00003", "$30/M"},
		{"invalid", "notanumber", "notanumber"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FormatPrice(tt.input); got != tt.want {
				t.Errorf("FormatPrice(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestFormatContextLength(t *testing.T) {
	tests := []struct {
		name  string
		input int
		want  string
	}{
		{"small", 512, "512"},
		{"exact_k", 4000, "4K"},
		{"fractional_k", 4500, "4.5K"},
		{"exact_128k", 128000, "128K"},
		{"exact_m", 1000000, "1M"},
		{"fractional_m", 1500000, "1.5M"},
		{"two_m", 2000000, "2M"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FormatContextLength(tt.input); got != tt.want {
				t.Errorf("FormatContextLength(%d) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestFormatModality(t *testing.T) {
	tests := []struct {
		name  string
		model Model
		want  string
	}{
		{
			"text_only",
			Model{Architecture: Architecture{InputModalities: []string{"text"}, OutputModalities: []string{"text"}}},
			"",
		},
		{
			"image_input",
			Model{Architecture: Architecture{InputModalities: []string{"text", "image"}, OutputModalities: []string{"text"}}},
			"👁",
		},
		{
			"audio_input",
			Model{Architecture: Architecture{InputModalities: []string{"text", "audio"}, OutputModalities: []string{"text"}}},
			"🎤",
		},
		{
			"image_output",
			Model{Architecture: Architecture{InputModalities: []string{"text"}, OutputModalities: []string{"text", "image"}}},
			"🖼",
		},
		{
			"multi_modal",
			Model{Architecture: Architecture{
				InputModalities:  []string{"text", "image", "audio", "video", "file"},
				OutputModalities: []string{"text", "image", "audio"},
			}},
			"👁 🎤 🎬 📎 🖼 🔊",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FormatModality(tt.model); got != tt.want {
				t.Errorf("FormatModality() = %q, want %q", got, tt.want)
			}
		})
	}
}
