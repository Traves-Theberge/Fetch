/**
 * @fileoverview Tests for project profiler
 *
 * Tests the buildProjectProfile function which enriches basic project type
 * detection with framework, package manager, test runner, entry points,
 * and description. All dockerExec calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dockerExec ─────────────────────────────────────────────────

const mockDockerExec = vi.fn();

vi.mock('../../src/utils/docker.js', () => ({
  dockerExec: (...args: unknown[]) => mockDockerExec(...args),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

import { buildProjectProfile } from '../../src/workspace/profiler.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Simulate a file existing in the container */
function fileExists(path: string) {
  mockDockerExec.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === 'test' && args.includes(path)) {
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    }
    return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
  });
}

/** Simulate multiple files and content reads */
function setupContainer(opts: {
  files?: string[];
  catResults?: Record<string, string>;
}) {
  const { files = [], catResults = {} } = opts;
  mockDockerExec.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === 'test' && args[0] === '-f') {
      const filePath = args[1];
      if (files.some(f => filePath.endsWith(f))) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
    }
    if (cmd === 'cat') {
      const filePath = args[0];
      for (const [key, content] of Object.entries(catResults)) {
        if (filePath.endsWith(key)) {
          return Promise.resolve({ exitCode: 0, stdout: content, stderr: '' });
        }
      }
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
    }
    return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Project Profiler', () => {
  beforeEach(() => {
    mockDockerExec.mockReset();
  });

  describe('buildProjectProfile', () => {
    it('should return base profile for unknown project type', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'unknown');

      expect(profile.type).toBe('unknown');
      expect(profile.language).toBe('Unknown');
      expect(profile.entryPoints).toEqual([]);
    });

    it('should detect TypeScript language', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.type).toBe('typescript');
      expect(profile.language).toBe('TypeScript');
    });

    it('should detect Python language', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.language).toBe('Python');
    });

    it('should detect Go language', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'go');

      expect(profile.language).toBe('Go');
    });

    it('should detect Rust language', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.language).toBe('Rust');
    });
  });

  describe('framework detection', () => {
    it('should detect Next.js from config file', async () => {
      setupContainer({ files: ['next.config.ts'] });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.framework).toBe('nextjs');
    });

    it('should detect Django from manage.py', async () => {
      setupContainer({ files: ['manage.py'] });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.framework).toBe('django');
    });

    it('should detect Express from package.json deps', async () => {
      setupContainer({
        catResults: {
          'package.json': JSON.stringify({
            dependencies: { express: '^4.18.0' },
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      expect(profile.framework).toBe('express');
    });

    it('should detect FastAPI from requirements.txt', async () => {
      setupContainer({
        catResults: {
          'requirements.txt': 'fastapi>=0.100.0\nuvicorn\npydantic',
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.framework).toBe('fastapi');
    });

    it('should detect Laravel from artisan file', async () => {
      setupContainer({ files: ['artisan'] });

      const profile = await buildProjectProfile('/workspace/test', 'php');

      expect(profile.framework).toBe('laravel');
    });

    it('should return undefined for no framework match', async () => {
      setupContainer({
        catResults: {
          'package.json': JSON.stringify({
            dependencies: { lodash: '^4.0.0' },
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      expect(profile.framework).toBeUndefined();
    });
  });

  describe('package manager detection', () => {
    it('should detect pnpm from lock file', async () => {
      setupContainer({ files: ['pnpm-lock.yaml'] });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.packageManager).toBe('pnpm');
    });

    it('should detect yarn from lock file', async () => {
      setupContainer({ files: ['yarn.lock'] });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      expect(profile.packageManager).toBe('yarn');
    });

    it('should detect poetry from lock file', async () => {
      setupContainer({ files: ['poetry.lock'] });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.packageManager).toBe('poetry');
    });

    it('should detect cargo from lock file', async () => {
      setupContainer({ files: ['Cargo.lock'] });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.packageManager).toBe('cargo');
    });

    it('should detect bundler from Gemfile.lock', async () => {
      setupContainer({ files: ['Gemfile.lock'] });

      const profile = await buildProjectProfile('/workspace/test', 'ruby');

      expect(profile.packageManager).toBe('bundler');
    });

    it('should prioritize pnpm over npm when both present', async () => {
      setupContainer({ files: ['pnpm-lock.yaml', 'package-lock.json'] });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      expect(profile.packageManager).toBe('pnpm');
    });
  });

  describe('test runner detection', () => {
    it('should detect vitest from devDependencies', async () => {
      setupContainer({
        catResults: {
          'package.json': JSON.stringify({
            devDependencies: { vitest: '^1.0.0' },
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.testRunner).toBe('vitest');
      expect(profile.testCommand).toBe('npx vitest run');
    });

    it('should detect pytest from requirements', async () => {
      setupContainer({
        catResults: {
          'requirements.txt': 'pytest>=7.0\nflask',
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.testRunner).toBe('pytest');
      expect(profile.testCommand).toBe('pytest');
    });

    it('should detect cargo test from Cargo.toml', async () => {
      setupContainer({ files: ['Cargo.toml'] });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.testRunner).toBe('cargo test');
      expect(profile.testCommand).toBe('cargo test');
    });

    it('should detect go test from go.mod', async () => {
      setupContainer({ files: ['go.mod'] });

      const profile = await buildProjectProfile('/workspace/test', 'go');

      expect(profile.testRunner).toBe('go test');
      expect(profile.testCommand).toBe('go test ./...');
    });

    it('should detect maven from pom.xml', async () => {
      setupContainer({ files: ['pom.xml'] });

      const profile = await buildProjectProfile('/workspace/test', 'java');

      expect(profile.testRunner).toBe('maven');
      expect(profile.testCommand).toBe('mvn test');
    });
  });

  describe('entry point detection', () => {
    it('should detect TypeScript entry points', async () => {
      setupContainer({ files: ['src/index.ts', 'src/app.ts'] });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.entryPoints).toContain('src/index.ts');
      expect(profile.entryPoints).toContain('src/app.ts');
    });

    it('should detect Python entry points', async () => {
      setupContainer({ files: ['main.py'] });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.entryPoints).toContain('main.py');
    });

    it('should detect Rust entry points', async () => {
      setupContainer({ files: ['src/main.rs', 'src/lib.rs'] });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.entryPoints).toContain('src/main.rs');
      expect(profile.entryPoints).toContain('src/lib.rs');
    });

    it('should cap entry points at 3', async () => {
      setupContainer({
        files: [
          'src/index.ts', 'src/main.ts', 'src/app.ts', 'index.ts', 'src/server.ts',
        ],
      });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.entryPoints.length).toBeLessThanOrEqual(3);
    });

    it('should return empty for unknown project type', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'unknown');

      expect(profile.entryPoints).toEqual([]);
    });
  });

  describe('description detection', () => {
    it('should extract description from package.json', async () => {
      setupContainer({
        catResults: {
          'package.json': JSON.stringify({
            description: 'A cool project',
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      expect(profile.description).toBe('A cool project');
    });

    it('should extract description from Cargo.toml', async () => {
      setupContainer({
        catResults: {
          'Cargo.toml': '[package]\nname = "my-crate"\ndescription = "A Rust project"\nversion = "0.1.0"',
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.description).toBe('A Rust project');
    });

    it('should extract module path from go.mod', async () => {
      setupContainer({
        catResults: {
          'go.mod': 'module github.com/user/myapp\n\ngo 1.21',
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'go');

      expect(profile.description).toBe('github.com/user/myapp');
    });

    it('should extract description from pyproject.toml', async () => {
      setupContainer({
        catResults: {
          'pyproject.toml': '[project]\nname = "myapp"\ndescription = "A Python app"\nversion = "0.1.0"',
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.description).toBe('A Python app');
    });
  });

  describe('build command detection', () => {
    it('should detect build command from package.json scripts', async () => {
      setupContainer({
        catResults: {
          'package.json': JSON.stringify({
            scripts: { build: 'tsc', dev: 'ts-node src/index.ts' },
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.buildCommand).toBe('npm run build');
    });

    it('should use default build command for Rust', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'rust');

      expect(profile.buildCommand).toBe('cargo build');
    });

    it('should use default build command for Go', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'go');

      expect(profile.buildCommand).toBe('go build');
    });

    it('should return undefined for Python (no default build)', async () => {
      mockDockerExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const profile = await buildProjectProfile('/workspace/test', 'python');

      expect(profile.buildCommand).toBeUndefined();
    });
  });

  describe('full profile integration', () => {
    it('should build complete TypeScript profile', async () => {
      setupContainer({
        files: ['next.config.ts', 'pnpm-lock.yaml', 'src/index.ts', 'src/app.ts'],
        catResults: {
          'package.json': JSON.stringify({
            description: 'My Next.js app',
            scripts: { build: 'next build' },
            devDependencies: { vitest: '^1.0.0' },
          }),
        },
      });

      const profile = await buildProjectProfile('/workspace/test', 'typescript');

      expect(profile.type).toBe('typescript');
      expect(profile.language).toBe('TypeScript');
      expect(profile.framework).toBe('nextjs');
      expect(profile.packageManager).toBe('pnpm');
      expect(profile.testRunner).toBe('vitest');
      expect(profile.testCommand).toBe('npx vitest run');
      expect(profile.buildCommand).toBe('npm run build');
      expect(profile.description).toBe('My Next.js app');
      expect(profile.entryPoints).toContain('src/index.ts');
    });

    it('should handle partial detection failures gracefully', async () => {
      // First call succeeds (framework file check), rest fail
      let callCount = 0;
      mockDockerExec.mockImplementation(() => {
        callCount++;
        if (callCount > 3) {
          return Promise.reject(new Error('Docker connection lost'));
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const profile = await buildProjectProfile('/workspace/test', 'node');

      // Should still return a valid profile with what it could detect
      expect(profile.type).toBe('node');
      expect(profile.language).toBe('JavaScript');
    });
  });
});
