/**
 * @fileoverview Workspace project-profile detection.
 *
 * Builds framework/package-manager/test-runner metadata for one workspace.
 *
 * @module workspace/profiler
 */

import { dockerExec } from '../utils/docker.js';
import { logger } from '../utils/logger.js';
import type { ProjectType, ProjectProfile } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Human-readable language names per project type */
const LANGUAGE_MAP: Record<ProjectType, string> = {
  node: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
  php: 'PHP',
  dotnet: 'C#',
  unknown: 'Unknown',
};

/** Framework detection rules — check files first, then deps in manifest */
const FRAMEWORK_RULES: Partial<Record<ProjectType, { files?: string[]; deps?: string[]; framework: string }[]>> = {
  node: [
    { files: ['next.config.js', 'next.config.ts', 'next.config.mjs'], framework: 'nextjs' },
    { files: ['nuxt.config.js', 'nuxt.config.ts'], framework: 'nuxt' },
    { files: ['svelte.config.js'], framework: 'svelte' },
    { files: ['astro.config.mjs', 'astro.config.ts'], framework: 'astro' },
    { deps: ['@nestjs/core'], framework: 'nestjs' },
    { deps: ['fastify'], framework: 'fastify' },
    { deps: ['express'], framework: 'express' },
    { deps: ['react', 'react-dom'], framework: 'react' },
    { deps: ['vue'], framework: 'vue' },
  ],
  typescript: [
    { files: ['next.config.ts', 'next.config.js', 'next.config.mjs'], framework: 'nextjs' },
    { files: ['nuxt.config.ts', 'nuxt.config.js'], framework: 'nuxt' },
    { deps: ['@nestjs/core'], framework: 'nestjs' },
    { deps: ['fastify'], framework: 'fastify' },
    { deps: ['express'], framework: 'express' },
  ],
  python: [
    { files: ['manage.py'], framework: 'django' },
    { deps: ['fastapi'], framework: 'fastapi' },
    { deps: ['flask'], framework: 'flask' },
    { deps: ['tornado'], framework: 'tornado' },
  ],
  ruby: [
    { deps: ['rails'], framework: 'rails' },
    { files: ['config.ru'], framework: 'rack' },
  ],
  java: [
    { deps: ['spring-boot'], framework: 'spring' },
  ],
  php: [
    { files: ['artisan'], framework: 'laravel' },
    { deps: ['symfony/framework-bundle'], framework: 'symfony' },
  ],
};

/** Lock file → package manager mapping (checked in priority order) */
const PKG_MANAGER_RULES: Partial<Record<ProjectType, { file: string; manager: string }[]>> = {
  node: [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'package-lock.json', manager: 'npm' },
  ],
  typescript: [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'package-lock.json', manager: 'npm' },
  ],
  python: [
    { file: 'uv.lock', manager: 'uv' },
    { file: 'poetry.lock', manager: 'poetry' },
    { file: 'Pipfile.lock', manager: 'pipenv' },
    { file: 'requirements.txt', manager: 'pip' },
  ],
  rust: [{ file: 'Cargo.lock', manager: 'cargo' }],
  go: [{ file: 'go.sum', manager: 'go' }],
  ruby: [{ file: 'Gemfile.lock', manager: 'bundler' }],
  php: [{ file: 'composer.lock', manager: 'composer' }],
  dotnet: [{ file: 'packages.lock.json', manager: 'nuget' }],
};

/** Test runner detection rules */
const TEST_RUNNER_RULES: Partial<Record<ProjectType, { dep?: string; file?: string; runner: string; command: string }[]>> = {
  node: [
    { dep: 'vitest', runner: 'vitest', command: 'npx vitest run' },
    { dep: 'jest', runner: 'jest', command: 'npx jest' },
    { dep: 'mocha', runner: 'mocha', command: 'npx mocha' },
    { dep: 'ava', runner: 'ava', command: 'npx ava' },
  ],
  typescript: [
    { dep: 'vitest', runner: 'vitest', command: 'npx vitest run' },
    { dep: 'jest', runner: 'jest', command: 'npx jest' },
  ],
  python: [
    { dep: 'pytest', runner: 'pytest', command: 'pytest' },
    { file: 'pytest.ini', runner: 'pytest', command: 'pytest' },
    { file: 'setup.cfg', runner: 'pytest', command: 'python -m pytest' },
  ],
  rust: [{ file: 'Cargo.toml', runner: 'cargo test', command: 'cargo test' }],
  go: [{ file: 'go.mod', runner: 'go test', command: 'go test ./...' }],
  java: [
    { file: 'pom.xml', runner: 'maven', command: 'mvn test' },
    { file: 'build.gradle', runner: 'gradle', command: 'gradle test' },
    { file: 'build.gradle.kts', runner: 'gradle', command: 'gradle test' },
  ],
  ruby: [
    { dep: 'rspec', runner: 'rspec', command: 'bundle exec rspec' },
    { file: 'Rakefile', runner: 'minitest', command: 'bundle exec rake test' },
  ],
  php: [
    { dep: 'phpunit/phpunit', runner: 'phpunit', command: 'vendor/bin/phpunit' },
  ],
};

/** Entry point candidates per project type (checked in order) */
const ENTRY_POINT_CANDIDATES: Record<ProjectType, string[]> = {
  node: ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'src/main.ts', 'src/app.ts', 'src/server.ts'],
  typescript: ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.ts', 'src/server.ts'],
  python: ['main.py', 'app.py', 'src/main.py', 'manage.py', 'app/__init__.py'],
  rust: ['src/main.rs', 'src/lib.rs'],
  go: ['main.go', 'cmd/main.go', 'cmd/server/main.go'],
  java: ['src/main/java/Main.java', 'src/main/java/App.java', 'src/main/java/Application.java'],
  ruby: ['app.rb', 'config.ru', 'lib/main.rb', 'bin/main'],
  php: ['index.php', 'public/index.php', 'src/index.php'],
  dotnet: ['Program.cs', 'Startup.cs'],
  unknown: [],
};

/** Default build commands per project type */
const DEFAULT_BUILD_COMMANDS: Partial<Record<ProjectType, string>> = {
  node: 'npm run build',
  typescript: 'npm run build',
  rust: 'cargo build',
  go: 'go build',
  java: 'mvn package',
  dotnet: 'dotnet build',
};

// ============================================================================
// Main Export
// ============================================================================

/** Probes a workspace and returns an enriched `ProjectProfile`. */
export async function buildProjectProfile(
  path: string,
  projectType: ProjectType
): Promise<ProjectProfile> {
  const profile: ProjectProfile = {
    type: projectType,
    language: LANGUAGE_MAP[projectType] ?? 'Unknown',
    entryPoints: [],
  };

  try {
    // Run detections in parallel where possible
    const [framework, pkgManager, testInfo, entryPoints, description, buildCommand] = await Promise.all([
      detectFramework(path, projectType),
      detectPackageManager(path, projectType),
      detectTestRunner(path, projectType),
      detectEntryPoints(path, projectType),
      detectDescription(path, projectType),
      detectBuildCommand(path, projectType),
    ]);

    profile.framework = framework;
    profile.packageManager = pkgManager;
    if (testInfo) {
      profile.testRunner = testInfo.runner;
      profile.testCommand = testInfo.command;
    }
    profile.entryPoints = entryPoints;
    profile.description = description;
    profile.buildCommand = buildCommand;
  } catch (err) {
    logger.debug('Partial profile detection failure (non-fatal)', { path, error: err });
  }

  return profile;
}

// ============================================================================
// Detection Functions
// ============================================================================

async function detectFramework(
  path: string,
  projectType: ProjectType
): Promise<string | undefined> {
  const rules = FRAMEWORK_RULES[projectType];
  if (!rules) return undefined;

  // Read manifest once for dep checks
  let manifest: Record<string, unknown> | null = null;

  for (const rule of rules) {
    // File-based detection
    if (rule.files) {
      for (const file of rule.files) {
        const result = await dockerExec('test', ['-f', `${path}/${file}`]);
        if (result.exitCode === 0) return rule.framework;
      }
    }

    // Dependency-based detection (requires manifest)
    if (rule.deps) {
      if (!manifest) {
        manifest = await readManifestDeps(path, projectType);
      }
      if (manifest && rule.deps.some(dep => dep in manifest!)) {
        return rule.framework;
      }
    }
  }

  return undefined;
}

async function detectPackageManager(
  path: string,
  projectType: ProjectType
): Promise<string | undefined> {
  const rules = PKG_MANAGER_RULES[projectType];
  if (!rules) return undefined;

  for (const rule of rules) {
    const result = await dockerExec('test', ['-f', `${path}/${rule.file}`]);
    if (result.exitCode === 0) return rule.manager;
  }

  return undefined;
}

async function detectTestRunner(
  path: string,
  projectType: ProjectType
): Promise<{ runner: string; command: string } | undefined> {
  const rules = TEST_RUNNER_RULES[projectType];
  if (!rules) return undefined;

  let manifest: Record<string, unknown> | null = null;

  for (const rule of rules) {
    if (rule.file) {
      const result = await dockerExec('test', ['-f', `${path}/${rule.file}`]);
      if (result.exitCode === 0) return { runner: rule.runner, command: rule.command };
    }

    if (rule.dep) {
      if (!manifest) {
        manifest = await readManifestDeps(path, projectType);
      }
      if (manifest && rule.dep in manifest) {
        return { runner: rule.runner, command: rule.command };
      }
    }
  }

  return undefined;
}

async function detectEntryPoints(
  path: string,
  projectType: ProjectType
): Promise<string[]> {
  const candidates = ENTRY_POINT_CANDIDATES[projectType];
  if (!candidates || candidates.length === 0) return [];

  const found: string[] = [];
  for (const candidate of candidates) {
    const result = await dockerExec('test', ['-f', `${path}/${candidate}`]);
    if (result.exitCode === 0) {
      found.push(candidate);
      if (found.length >= 3) break; // Cap at 3 entry points
    }
  }

  return found;
}

async function detectDescription(
  path: string,
  projectType: ProjectType
): Promise<string | undefined> {
  try {
    switch (projectType) {
      case 'node':
      case 'typescript': {
        const result = await dockerExec('cat', [`${path}/package.json`], { timeoutMs: 2000 });
        if (result.exitCode === 0) {
          const pkg = JSON.parse(result.stdout);
          return pkg.description || undefined;
        }
        break;
      }
      case 'rust': {
        const result = await dockerExec('cat', [`${path}/Cargo.toml`], { timeoutMs: 2000 });
        if (result.exitCode === 0) {
          const match = result.stdout.match(/^description\s*=\s*"([^"]+)"/m);
          return match?.[1];
        }
        break;
      }
      case 'python': {
        // Try pyproject.toml first
        const pyproject = await dockerExec('cat', [`${path}/pyproject.toml`], { timeoutMs: 2000 });
        if (pyproject.exitCode === 0) {
          const match = pyproject.stdout.match(/^description\s*=\s*"([^"]+)"/m);
          if (match) return match[1];
        }
        break;
      }
      case 'go': {
        const result = await dockerExec('cat', [`${path}/go.mod`], { timeoutMs: 2000 });
        if (result.exitCode === 0) {
          const match = result.stdout.match(/^module\s+(.+)/m);
          return match?.[1]?.trim();
        }
        break;
      }
      case 'php': {
        const result = await dockerExec('cat', [`${path}/composer.json`], { timeoutMs: 2000 });
        if (result.exitCode === 0) {
          const pkg = JSON.parse(result.stdout);
          return pkg.description || undefined;
        }
        break;
      }
      case 'ruby': {
        // Try .gemspec
        const gemspec = await dockerExec('sh', ['-c', `cat "${path}"/*.gemspec 2>/dev/null | head -20`], { timeoutMs: 2000 });
        if (gemspec.exitCode === 0 && gemspec.stdout.trim()) {
          const match = gemspec.stdout.match(/\.summary\s*=\s*["']([^"']+)["']/);
          return match?.[1];
        }
        break;
      }
    }
  } catch {
    // Description is best-effort
  }

  return undefined;
}

async function detectBuildCommand(
  path: string,
  projectType: ProjectType
): Promise<string | undefined> {
  // For node/typescript, check package.json scripts
  if (projectType === 'node' || projectType === 'typescript') {
    try {
      const result = await dockerExec('cat', [`${path}/package.json`], { timeoutMs: 2000 });
      if (result.exitCode === 0) {
        const pkg = JSON.parse(result.stdout);
        if (pkg.scripts?.build) {
          return 'npm run build';
        }
      }
    } catch {
      // Fall through to default
    }
  }

  return DEFAULT_BUILD_COMMANDS[projectType];
}

// ============================================================================
// Helpers
// ============================================================================

/** Reads manifest dependencies and returns a flat lookup map. */
async function readManifestDeps(
  path: string,
  projectType: ProjectType
): Promise<Record<string, unknown> | null> {
  try {
    if (projectType === 'node' || projectType === 'typescript') {
      const result = await dockerExec('cat', [`${path}/package.json`], { timeoutMs: 2000 });
      if (result.exitCode === 0) {
        const pkg = JSON.parse(result.stdout);
        return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      }
    }

    if (projectType === 'python') {
      // Read requirements.txt line by line
      const result = await dockerExec('cat', [`${path}/requirements.txt`], { timeoutMs: 2000 });
      if (result.exitCode === 0) {
        const deps: Record<string, boolean> = {};
        for (const line of result.stdout.split('\n')) {
          const name = line.trim().split(/[>=<[!;#]/)[0].trim().toLowerCase();
          if (name) deps[name] = true;
        }
        return deps;
      }
    }

    if (projectType === 'ruby') {
      const result = await dockerExec('cat', [`${path}/Gemfile`], { timeoutMs: 2000 });
      if (result.exitCode === 0) {
        const deps: Record<string, boolean> = {};
        for (const match of result.stdout.matchAll(/gem\s+['"]([^'"]+)['"]/g)) {
          deps[match[1]] = true;
        }
        return deps;
      }
    }

    if (projectType === 'php') {
      const result = await dockerExec('cat', [`${path}/composer.json`], { timeoutMs: 2000 });
      if (result.exitCode === 0) {
        const pkg = JSON.parse(result.stdout);
        return { ...(pkg.require ?? {}), ...(pkg['require-dev'] ?? {}) };
      }
    }
  } catch {
    // Manifest read is best-effort
  }

  return null;
}
