/**
 * @fileoverview Repository Map Generation
 * 
 * Generates a concise map of the repository structure including 
 * key symbols for improved agent context.
 * 
 * @module workspace/repo-map
 */

import { dockerExec } from '../utils/docker.js';
import { logger } from '../utils/logger.js';
import { extractSymbols, type SymbolInfo } from './symbols.js';

/**
 * Repository map entry for a file
 */
export interface RepoMapEntry {
  path: string;
  symbols: SymbolInfo[];
}

/**
 * Options for repo map generation
 */
export interface RepoMapOptions {
  maxFiles?: number;
  exclude?: string[];
  maxDepth?: number;
}

/**
 * Generate a concise repository map for a workspace
 * 
 * @param workspacePath - Path to the workspace in container
 * @param options - Generation options
 * @returns Formatted repository map string
 */
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

    findArgs.push(
      '-type', 'f',
      '(', 
      '-name', '*.ts', '-o', 
      '-name', '*.tsx', '-o', 
      '-name', '*.js', '-o', 
      '-name', '*.jsx', '-o', 
      '-name', '*.py', '-o', 
      '-name', '*.go', 
      ')'
    );

    // 1. Find relevant files (mostly source files, exclude noise)
    const findResult = await dockerExec('find', findArgs, { cwd: workspacePath });

    if (findResult.exitCode !== 0) {
      throw new Error(`Failed to list files: ${findResult.stderr}`);
    }

    const files = findResult.stdout.trim().split('\n').filter(f => f.length > 0);
    logger.debug(`🔍 Found ${files.length} relevant files for map`);

    // 2. Process up to top N files to keep context manageable
    const entries: RepoMapEntry[] = [];
    const processingFiles = files.slice(0, maxFiles);

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
    return formatRepoMap(entries);
  } catch (error) {
    logger.error('Failed to generate repo-map', error);
    return 'Failed to generate repository map.';
  }
}

/**
 * Format repo map entries into a readable string
 */
function formatRepoMap(entries: RepoMapEntry[]): string {
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

  for (const dir of sortedDirs) {
    output += `${dir}/\n`;
    const dirEntries = dirs.get(dir)!;
    
    for (const entry of dirEntries) {
      const fileName = entry.path.split('/').pop();
      const symbolSummary = entry.symbols
        .map(s => s.name)
        .slice(0, 8) // Limit symbols per file
        .join(', ');
        
      output += `  ${fileName} - exports: ${symbolSummary}${entry.symbols.length > 8 ? '...' : ''}\n`;
    }
    output += '\n';
  }

  return output.trim();
}
