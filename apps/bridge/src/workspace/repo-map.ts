/**
 * @fileoverview Repository map generation for prompt context.
 *
 * Produces a compact file/symbol summary under a configurable output budget.
 *
 * @module workspace/repo-map
 */

import { dockerExec } from '../utils/docker.js';
import { logger } from '../utils/logger.js';
import { extractSymbols, type SymbolInfo } from './symbols.js';
import type { ProjectType } from './types.js';

/** One repo-map entry for a source file. */
export interface RepoMapEntry {
  path: string;
  symbols: SymbolInfo[];
}

/** File extensions scanned per detected project type. */
const EXTENSION_MAP: Record<ProjectType, string[]> = {
  node:       ['*.ts', '*.tsx', '*.js', '*.jsx'],
  typescript: ['*.ts', '*.tsx', '*.js', '*.jsx'],
  python:     ['*.py'],
  rust:       ['*.rs'],
  go:         ['*.go'],
  java:       ['*.java'],
  ruby:       ['*.rb'],
  php:        ['*.php'],
  dotnet:     ['*.cs', '*.fs'],
  unknown:    ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.go', '*.rs', '*.java', '*.rb', '*.php', '*.cs'],
};

/** Options that control repo-map depth, file count, and output budget. */
export interface RepoMapOptions {
  maxFiles?: number;
  exclude?: string[];
  maxDepth?: number;
  /** Max output characters to keep the repo map within a predictable token budget */
  maxOutputChars?: number;
  /** Project type to determine which file extensions to search */
  projectType?: ProjectType;
}

/** Builds a repo map string for one workspace path. */
export async function generateRepoMap(workspacePath: string, options: RepoMapOptions = {}): Promise<string> {
  try {
    logger.info(`🗺️ Generating repo-map for ${workspacePath}...`);
    
    const maxDepth = options.maxDepth || 4;
    const maxFiles = options.maxFiles || 50;

    // Build find args
    const findArgs = [
      '.',
      '-maxdepth', maxDepth.toString(),
      '-not', '-path', '*/.*',
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/dist/*',
      '-not', '-path', '*/build/*',
      '-not', '-path', '*/target/*',
      '-not', '-path', '*/venv/*',
      '-not', '-path', '*/__pycache__/*',
    ];

    if (options.exclude) {
        options.exclude.forEach(ex => {
            findArgs.push('-not', '-path', `*/${ex}/*`);
        });
    }

    // Build extension filter from project type
    const extensions = EXTENSION_MAP[options.projectType ?? 'unknown'];
    const nameArgs: string[] = ['-type', 'f', '('];
    extensions.forEach((ext, i) => {
      if (i > 0) nameArgs.push('-o');
      nameArgs.push('-name', ext);
    });
    nameArgs.push(')');
    findArgs.push(...nameArgs);

    // 1. Find relevant files (mostly source files, exclude noise)
    const findResult = await dockerExec('find', findArgs, { cwd: workspacePath });

    if (findResult.exitCode !== 0) {
      throw new Error(`Failed to list files: ${findResult.stderr}`);
    }

    const files = findResult.stdout.trim().split('\n').filter(f => f.length > 0);
    const orderedFiles = Array.from(new Set(files))
      .sort((a, b) => normalizeRepoPath(a).localeCompare(normalizeRepoPath(b)));
    logger.debug(`🔍 Found ${files.length} relevant files for map`);

    // 2. Process up to top N files to keep context manageable
    const entries: RepoMapEntry[] = [];
    const processingFiles = orderedFiles.slice(0, maxFiles);

    for (const file of processingFiles) {
      // Read first 10KB of the file for symbols
      const readResult = await dockerExec('head', ['-c', '10240', file], { cwd: workspacePath });
      
      if (readResult.exitCode === 0) {
        const symbols = extractSymbols(readResult.stdout, file);
        if (symbols.length > 0) {
          entries.push({
            path: file.startsWith('./') ? file.substring(2) : file,
            symbols
          });
        }
      }
    }

    // 3. Format as a tree-like string
    return formatRepoMap(entries, options.maxOutputChars ?? 3000);
  } catch (error) {
    logger.error('Failed to generate repo-map', error);
    return 'Failed to generate repository map.';
  }
}

function normalizeRepoPath(file: string): string {
  return file.startsWith('./') ? file.slice(2) : file;
}

/** Formats entries into grouped text while enforcing `maxOutputChars`. */
function formatRepoMap(entries: RepoMapEntry[], maxOutputChars: number = 3000): string {
  if (entries.length === 0) return 'No symbols found.';

  let output = '## Repository Map (Key Symbols)\n\n';

  // Group by directory
  const dirs = new Map<string, RepoMapEntry[]>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : './';
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(entry);
  }

  // Sort directories
  const sortedDirs = Array.from(dirs.keys()).sort();
  let totalEntries = 0;
  const totalFiles = entries.length;

  for (const dir of sortedDirs) {
    const dirHeader = `${dir}/\n`;

    // Check if adding this directory header would exceed the budget
    if (output.length + dirHeader.length >= maxOutputChars) {
      const remaining = totalFiles - totalEntries;
      output += `... (truncated, ${remaining} files omitted)\n`;
      return output.trim();
    }

    output += dirHeader;
    const dirEntries = dirs.get(dir)!;

    for (const entry of dirEntries) {
      const fileName = entry.path.split('/').pop();
      const symbolSummary = entry.symbols
        .map(s => s.name)
        .slice(0, 8) // Limit symbols per file
        .join(', ');

      const line = `  ${fileName} - exports: ${symbolSummary}${entry.symbols.length > 8 ? '...' : ''}\n`;

      if (output.length + line.length >= maxOutputChars) {
        const remaining = totalFiles - totalEntries;
        output += `... (truncated, ${remaining} files omitted)\n`;
        return output.trim();
      }

      output += line;
      totalEntries++;
    }
    output += '\n';
  }

  return output.trim();
}
