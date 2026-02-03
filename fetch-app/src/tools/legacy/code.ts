/**
 * @fileoverview Code Intelligence Tools
 * 
 * Tools for understanding and navigating codebase structure.
 * Provides repository mapping, code search, and symbol extraction.
 * 
 * @module tools/code
 * @see {@link repoMapTool} - Generate repository structure map
 * @see {@link searchCodeTool} - Search for text/patterns in code
 * @see {@link findDefinitionTool} - Find symbol definitions
 * @see {@link findReferencesTool} - Find symbol usages
 * 
 * ## Tools
 * 
 * | Tool | Description | Approval |
 * |------|-------------|----------|
 * | repo_map | Generate project structure with signatures | Auto |
 * | search_code | Regex search across codebase | Auto |
 * | find_definition | Find where symbol is defined | Auto |
 * | find_references | Find all usages of symbol | Auto |
 * 
 * ## Supported Languages
 * 
 * Symbol extraction supports:
 * - TypeScript/JavaScript (.ts, .tsx, .js, .jsx)
 * - Python (.py)
 * - Rust (.rs)
 * - Go (.go)
 * - And more...
 * 
 * ## File Filtering
 * 
 * Automatically skips:
 * - node_modules, .git, dist, build
 * - __pycache__, .venv, coverage
 * - Other common build artifacts
 * 
 * @example
 * ```typescript
 * import { codeTools } from './code.js';
 * 
 * // Generate repo map
 * const map = await repoMapTool.execute({ depth: 3 });
 * 
 * // Search for pattern
 * const results = await searchCodeTool.execute({
 *   pattern: 'TODO|FIXME',
 *   regex: true
 * });
 * ```
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { Tool, ToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Workspace root for code operations */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

/** File extensions to include in repo map */
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.php', '.swift', '.scala',
  '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.txt', '.sh', '.bash'
]);

/** Directories to skip when scanning */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '__pycache__', '.venv', 'venv', '.env',
  'coverage', '.nyc_output', '.next', '.nuxt'
]);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a successful tool result.
 * @private
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

/**
 * Creates a failed tool result.
 * @private
 */
function failure(error: string, duration: number): ToolResult {
  return { success: false, output: '', error, duration };
}

/**
 * Extracts function/class signatures from TypeScript/JavaScript.
 * 
 * @param {string} content - File content
 * @returns {string[]} Array of signature strings
 * @private
 */
function extractTsSignatures(content: string): string[] {
  const signatures: string[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Export statements
    if (line.startsWith('export ')) {
      // Export function
      const funcMatch = line.match(/export\s+(async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        // Get the full signature (handle multi-line)
        let sig = line;
        if (!sig.includes(')') && !sig.includes('{')) {
          // Multi-line signature, grab next lines
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            sig += ' ' + lines[j].trim();
            if (lines[j].includes(')') || lines[j].includes('{')) break;
          }
        }
        // Extract just the signature part
        const sigEnd = sig.indexOf('{');
        if (sigEnd > 0) sig = sig.substring(0, sigEnd).trim();
        signatures.push(sig);
        continue;
      }
      
      // Export class
      const classMatch = line.match(/export\s+(abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        signatures.push(line.split('{')[0].trim());
        continue;
      }
      
      // Export interface
      const interfaceMatch = line.match(/export\s+interface\s+(\w+)/);
      if (interfaceMatch) {
        signatures.push(line.split('{')[0].trim());
        continue;
      }
      
      // Export type
      const typeMatch = line.match(/export\s+type\s+(\w+)/);
      if (typeMatch) {
        signatures.push(line.split('=')[0].trim());
        continue;
      }
      
      // Export const
      const constMatch = line.match(/export\s+const\s+(\w+)/);
      if (constMatch) {
        const name = constMatch[1];
        // Include type annotation if present
        const colonIdx = line.indexOf(':');
        const eqIdx = line.indexOf('=');
        if (colonIdx > 0 && eqIdx > colonIdx) {
          signatures.push(`export const ${name}: ${line.substring(colonIdx + 1, eqIdx).trim()}`);
        } else {
          signatures.push(`export const ${name}`);
        }
        continue;
      }
    }
    
    // Class methods (for context within classes)
    const methodMatch = line.match(/^\s*(public|private|protected|async|static|\s)*\s*(\w+)\s*\([^)]*\)/);
    if (methodMatch && !line.includes('function') && !line.startsWith('//')) {
      // Likely a method - but we'll skip for brevity in repo map
    }
  }
  
  return signatures;
}

/**
 * Extract symbol signatures from Python
 */
function extractPySignatures(content: string): string[] {
  const signatures: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Function definitions
    const funcMatch = line.match(/^(async\s+)?def\s+(\w+)\s*\([^)]*\)/);
    if (funcMatch) {
      signatures.push(line.split(':')[0].trim());
      continue;
    }
    
    // Class definitions
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      signatures.push(line.split(':')[0].trim());
      continue;
    }
  }
  
  return signatures;
}

/**
 * Extract signatures based on file extension
 */
function extractSignatures(content: string, ext: string): string[] {
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
      return extractTsSignatures(content);
    case '.py':
      return extractPySignatures(content);
    default:
      return [];
  }
}

// ============================================================================
// Tool: repo_map
// ============================================================================

const repoMapTool: Tool = {
  name: 'repo_map',
  description: 'Get a condensed view of the codebase structure, showing files and their exported symbols.',
  category: 'code',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Subdirectory to map (relative to workspace, defaults to root)',
      required: false
    },
    {
      name: 'max_depth',
      type: 'number',
      description: 'Maximum directory depth to traverse',
      required: false,
      default: 4
    },
    {
      name: 'include_signatures',
      type: 'boolean',
      description: 'Whether to include function/class signatures',
      required: false,
      default: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const basePath = (args.path as string) || '';
    const maxDepth = (args.max_depth as number) || 4;
    const includeSignatures = (args.include_signatures as boolean) ?? true;

    try {
      const rootPath = join(WORKSPACE_ROOT, basePath);
      const output: string[] = [];
      let fileCount = 0;
      let signatureCount = 0;

      async function processDir(dir: string, depth: number, prefix: string): Promise<void> {
        if (depth > maxDepth) return;

        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }

        // Sort entries
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
          // Skip hidden and ignored directories
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
            continue;
          }

          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            output.push(`${prefix}${entry.name}/`);
            await processDir(fullPath, depth + 1, prefix + '  ');
          } else {
            const ext = extname(entry.name);
            
            if (CODE_EXTENSIONS.has(ext)) {
              fileCount++;
              
              if (includeSignatures) {
                try {
                  const content = await readFile(fullPath, 'utf-8');
                  const signatures = extractSignatures(content, ext);
                  
                  if (signatures.length > 0) {
                    output.push(`${prefix}${entry.name}:`);
                    for (const sig of signatures.slice(0, 10)) { // Limit per file
                      output.push(`${prefix}  ${sig}`);
                      signatureCount++;
                    }
                    if (signatures.length > 10) {
                      output.push(`${prefix}  ... (${signatures.length - 10} more)`);
                    }
                  } else {
                    output.push(`${prefix}${entry.name}`);
                  }
                } catch {
                  output.push(`${prefix}${entry.name}`);
                }
              } else {
                output.push(`${prefix}${entry.name}`);
              }
            }
          }
        }
      }

      await processDir(rootPath, 0, '');

      const result = output.join('\n');
      
      // Truncate if too long (stay under ~8K tokens)
      const maxLength = 24000; // ~6K tokens
      const truncated = result.length > maxLength;
      const finalOutput = truncated 
        ? result.substring(0, maxLength) + '\n... (truncated)'
        : result;

      logger.debug('Generated repo map', { fileCount, signatureCount, truncated });

      return success(
        finalOutput,
        Date.now() - startTime,
        { fileCount, signatureCount, truncated }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to generate repo map: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: find_definition
// ============================================================================

const findDefinitionTool: Tool = {
  name: 'find_definition',
  description: 'Find where a symbol (function, class, variable) is defined.',
  category: 'code',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Name of the symbol to find',
      required: true
    },
    {
      name: 'file_hint',
      type: 'string',
      description: 'Hint about which file might contain the definition',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const symbol = args.symbol as string;
    const fileHint = args.file_hint as string | undefined;

    try {
      const definitions: { file: string; line: number; context: string }[] = [];
      
      // Patterns that indicate a definition
      const defPatterns = [
        new RegExp(`^\\s*export\\s+(async\\s+)?function\\s+${symbol}\\s*[(<]`, 'm'),
        new RegExp(`^\\s*export\\s+(abstract\\s+)?class\\s+${symbol}\\s*[{<]`, 'm'),
        new RegExp(`^\\s*export\\s+interface\\s+${symbol}\\s*[{<]`, 'm'),
        new RegExp(`^\\s*export\\s+type\\s+${symbol}\\s*[=<]`, 'm'),
        new RegExp(`^\\s*export\\s+(const|let|var)\\s+${symbol}\\s*[=:]`, 'm'),
        new RegExp(`^\\s*(async\\s+)?function\\s+${symbol}\\s*[(<]`, 'm'),
        new RegExp(`^\\s*class\\s+${symbol}\\s*[{<]`, 'm'),
        new RegExp(`^\\s*const\\s+${symbol}\\s*=`, 'm'),
        new RegExp(`^\\s*def\\s+${symbol}\\s*\\(`, 'm'), // Python
        new RegExp(`^\\s*class\\s+${symbol}[:(]`, 'm'),  // Python
      ];

      async function searchInDir(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
            continue;
          }

          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await searchInDir(fullPath);
          } else {
            const ext = extname(entry.name);
            if (!CODE_EXTENSIONS.has(ext)) continue;

            // If we have a file hint, prioritize matching files
            if (fileHint && !entry.name.includes(fileHint) && !fullPath.includes(fileHint)) {
              continue;
            }

            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                for (const pattern of defPatterns) {
                  if (pattern.test(line)) {
                    definitions.push({
                      file: relative(WORKSPACE_ROOT, fullPath),
                      line: i + 1,
                      context: line.trim().substring(0, 200)
                    });
                    break;
                  }
                }
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }

      await searchInDir(WORKSPACE_ROOT);

      if (definitions.length === 0) {
        return success(
          `No definition found for "${symbol}"`,
          Date.now() - startTime,
          { found: false }
        );
      }

      const output = definitions.map(d => 
        `${d.file}:${d.line}\n  ${d.context}`
      ).join('\n\n');

      return success(
        output,
        Date.now() - startTime,
        { found: true, count: definitions.length }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to find definition: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: find_references
// ============================================================================

const findReferencesTool: Tool = {
  name: 'find_references',
  description: 'Find all usages of a symbol across the codebase.',
  category: 'code',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Name of the symbol to find references for',
      required: true
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of references to return',
      required: false,
      default: 30
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const symbol = args.symbol as string;
    const maxResults = (args.max_results as number) || 30;

    try {
      const references: { file: string; line: number; context: string }[] = [];
      
      // Word boundary pattern for the symbol
      const pattern = new RegExp(`\\b${symbol}\\b`);

      async function searchInDir(dir: string): Promise<void> {
        if (references.length >= maxResults) return;

        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (references.length >= maxResults) break;
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
            continue;
          }

          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await searchInDir(fullPath);
          } else {
            const ext = extname(entry.name);
            if (!CODE_EXTENSIONS.has(ext)) continue;

            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length && references.length < maxResults; i++) {
                if (pattern.test(lines[i])) {
                  references.push({
                    file: relative(WORKSPACE_ROOT, fullPath),
                    line: i + 1,
                    context: lines[i].trim().substring(0, 150)
                  });
                }
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }

      await searchInDir(WORKSPACE_ROOT);

      if (references.length === 0) {
        return success(
          `No references found for "${symbol}"`,
          Date.now() - startTime,
          { found: false, count: 0 }
        );
      }

      const output = references.map(r => 
        `${r.file}:${r.line}: ${r.context}`
      ).join('\n');

      return success(
        output,
        Date.now() - startTime,
        { found: true, count: references.length, truncated: references.length >= maxResults }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to find references: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: get_diagnostics
// ============================================================================

const getDiagnosticsTool: Tool = {
  name: 'get_diagnostics',
  description: 'Get TypeScript compilation errors or linting issues.',
  category: 'code',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'File or directory to check (relative to workspace)',
      required: false
    }
  ],
  execute: async (_args): Promise<ToolResult> => {
    const startTime = Date.now();

    try {
      // For now, we'll run tsc --noEmit to get diagnostics
      // This is a simplified version - could be enhanced with proper TS API
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Check if tsconfig exists
      const tsconfigPath = join(WORKSPACE_ROOT, 'tsconfig.json');
      let hasTsConfig = false;
      try {
        await stat(tsconfigPath);
        hasTsConfig = true;
      } catch {
        // No tsconfig
      }

      if (!hasTsConfig) {
        return success(
          'No tsconfig.json found in workspace',
          Date.now() - startTime,
          { hasConfig: false }
        );
      }

      try {
        const { stdout, stderr } = await execAsync(
          'npx tsc --noEmit --pretty false 2>&1 || true',
          { cwd: WORKSPACE_ROOT, timeout: 30000 }
        );

        const output = stdout || stderr || 'No errors found';
        
        // Count errors
        const errorCount = (output.match(/error TS\d+/g) || []).length;

        return success(
          output.trim() || 'No TypeScript errors found',
          Date.now() - startTime,
          { errorCount }
        );
      } catch (execError) {
        // TypeScript might not be installed
        return success(
          'Could not run TypeScript diagnostics (tsc not available)',
          Date.now() - startTime,
          { available: false }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to get diagnostics: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Export all code tools
// ============================================================================

export const codeTools: Tool[] = [
  repoMapTool,
  findDefinitionTool,
  findReferencesTool,
  getDiagnosticsTool
];
