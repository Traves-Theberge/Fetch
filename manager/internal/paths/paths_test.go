package paths

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsFetchProject(t *testing.T) {
	tmpDir := t.TempDir()

	if isFetchProject(tmpDir) {
		t.Fatalf("expected temp dir without markers to not be recognized as fetch project")
	}

	if err := os.WriteFile(filepath.Join(tmpDir, "docker-compose.yml"), []byte("services: {}"), 0o644); err != nil {
		t.Fatalf("failed writing compose marker: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tmpDir, "fetch-app"), 0o755); err != nil {
		t.Fatalf("failed creating fetch-app marker dir: %v", err)
	}

	if !isFetchProject(tmpDir) {
		t.Fatalf("expected directory with markers to be recognized as fetch project")
	}
}

func TestResolveProjectDirUsesFetchDirOverride(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("FETCH_DIR", tmpDir)

	resolved := resolveProjectDir()
	if resolved != tmpDir {
		t.Fatalf("expected resolveProjectDir to honor FETCH_DIR override, got %q", resolved)
	}
}
