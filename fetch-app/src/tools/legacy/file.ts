/**
 * @fileoverview File System Tools
 * 
 * Tools for file system operations within the workspace. All paths are
 * validated to prevent access outside the workspace root.
 * 
 * @module tools/file
 * @see {@link readFileTool} - Read file contents
 * @see {@link writeFileTool} - Create/overwrite files
 * @see {@link editFileTool} - Search/replace edits
 * @see {@link listDirectoryTool} - List directory contents
 * @see {@link searchFilesTool} - Find files by pattern
 * 
 * ## Security
 * 
 * All file operations are sandboxed to WORKSPACE_ROOT:
 * - Paths are resolved relative to workspace
 * - Path traversal (../) is blocked
 * - Absolute paths outside workspace are rejected
 * 
 * ## Tools
 * 
 * | Tool | Description | Approval |
 * |------|-------------|----------|
 * | read_file | Read contents (with optional line range) | Auto |
 * | write_file | Create or overwrite a file | Required |
 * | edit_file | Search/replace in existing file | Required |
 * | list_directory | List folder contents | Auto |
 * | search_files | Find files by glob pattern | Auto |
 * 
 * @example
 * ```typescript
 * import { fileTools } from './file.js';
 * 
 * // Read a file
 * const result = await fileTools[0].execute({ path: 'src/app.ts' });
 * 
 * // Edit a file
 * await editFileTool.execute({
 *   path: 'src/app.ts',
 *   old_string: 'const x = 1',
 *   new_string: 'const x = 2'
 * });
 * ```
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { Tool, ToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Workspace root directory (mounted in Docker) */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolves a path relative to workspace root.
 * 
 * @param {string} filePath - Path to resolve
 * @returns {string} Absolute path within workspace
 * @private
 */
function resolvePath(filePath: string): string {
  // If already absolute and within workspace, use as-is
  if (filePath.startsWith(WORKSPACE_ROOT)) {
    return filePath;
  }
  // Otherwise, join with workspace root
  return join(WORKSPACE_ROOT, filePath);
}

/**
 * Validates that a path is within workspace bounds.
 * 
 * @param {string} filePath - Path to validate
 * @returns {boolean} True if path is safe
 * @private
 */
function validatePath(filePath: string): boolean {
  const resolved = resolvePath(filePath);
  const rel = relative(WORKSPACE_ROOT, resolved);
  return !rel.startsWith('..') && !rel.startsWith('/');
}

/**
 * Creates a successful tool result.
 * 
 * @param {string} output - Result output
 * @param {number} duration - Execution time in ms
 * @param {Record<string, unknown>} [metadata] - Optional metadata
 * @returns {ToolResult} Success result
 * @private
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

/**
 * Creates a failed tool result.
 * 
 * @param {string} error - Error message
 * @param {number} duration - Execution time in ms
 * @returns {ToolResult} Failure result
 * @private
 */
function failure(error: string, duration: number): ToolResult {
  return { success: false, output: '', error, duration };
}

// ============================================================================
// Tool: read_file
// ============================================================================

const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Can optionally read specific line ranges.',
  category: 'file',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace root)',
      required: true
    },
    {
      name: 'start_line',
      type: 'number',
      description: 'Start line number (1-indexed, optional)',
      required: false
    },
    {
      name: 'end_line',
      type: 'number',
      description: 'End line number (1-indexed, inclusive, optional)',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const filePath = args.path as string;
    const startLine = args.start_line as number | undefined;
    const endLine = args.end_line as number | undefined;

    try {
      if (!validatePath(filePath)) {
        return failure('Path is outside workspace', Date.now() - startTime);
      }

      const resolved = resolvePath(filePath);
      const content = await readFile(resolved, 'utf-8');
      
      let output = content;
      let totalLines = content.split('\n').length;
      let rangeInfo: { startLine?: number; endLine?: number } = {};

      // Handle line range
      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = Math.max(1, startLine || 1);
        const end = Math.min(lines.length, endLine || lines.length);
        
        output = lines.slice(start - 1, end).join('\n');
        totalLines = lines.length;
        rangeInfo = { startLine: start, endLine: end };
      }

      logger.debug('Read file', { path: filePath, length: output.length });
      
      return success(
        output,
        Date.now() - startTime,
        { 
          path: filePath, 
          length: output.length,
          lineCount: output.split('\n').length,
          totalLines,
          ...rangeInfo
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to read file: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: write_file
// ============================================================================

const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist.',
  category: 'file',
  autoApprove: false,  // Requires approval
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace root)',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const filePath = args.path as string;
    const content = args.content as string;

    try {
      if (!validatePath(filePath)) {
        return failure('Path is outside workspace', Date.now() - startTime);
      }

      const resolved = resolvePath(filePath);
      await writeFile(resolved, content, 'utf-8');

      logger.info('Wrote file', { path: filePath, length: content.length });
      
      return success(
        `Successfully wrote ${content.length} bytes to ${filePath}`,
        Date.now() - startTime,
        { path: filePath, length: content.length }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to write file: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: edit_file
// ============================================================================

const editFileTool: Tool = {
  name: 'edit_file',
  description: 'Make a targeted edit to a file using search and replace. The search string must match exactly.',
  category: 'file',
  autoApprove: false,  // Requires approval
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace root)',
      required: true
    },
    {
      name: 'search',
      type: 'string',
      description: 'Exact text to search for (must match exactly)',
      required: true
    },
    {
      name: 'replace',
      type: 'string',
      description: 'Text to replace the search string with',
      required: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const filePath = args.path as string;
    const search = args.search as string;
    const replace = args.replace as string;

    try {
      if (!validatePath(filePath)) {
        return failure('Path is outside workspace', Date.now() - startTime);
      }

      const resolved = resolvePath(filePath);
      const content = await readFile(resolved, 'utf-8');

      // Check if search string exists
      if (!content.includes(search)) {
        return failure(
          'Search string not found in file. Make sure it matches exactly (including whitespace).',
          Date.now() - startTime
        );
      }

      // Count occurrences
      const occurrences = content.split(search).length - 1;
      
      if (occurrences > 1) {
        return failure(
          `Search string found ${occurrences} times. Please make it more specific to match exactly once.`,
          Date.now() - startTime
        );
      }

      // Perform replacement
      const newContent = content.replace(search, replace);
      await writeFile(resolved, newContent, 'utf-8');

      logger.info('Edited file', { path: filePath });
      
      return success(
        `Successfully edited ${filePath}`,
        Date.now() - startTime,
        { path: filePath, searchLength: search.length, replaceLength: replace.length }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to edit file: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: search_files
// ============================================================================

const searchFilesTool: Tool = {
  name: 'search_files',
  description: 'Search for text or patterns across files in the workspace.',
  category: 'file',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Text or regex pattern to search for',
      required: true
    },
    {
      name: 'path',
      type: 'string',
      description: 'Directory path to search in (relative to workspace, defaults to root)',
      required: false
    },
    {
      name: 'regex',
      type: 'boolean',
      description: 'Whether to treat query as a regex pattern',
      required: false,
      default: false
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of results to return',
      required: false,
      default: 50
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const query = args.query as string;
    const searchPath = (args.path as string) || '';
    const isRegex = (args.regex as boolean) || false;
    const maxResults = (args.max_results as number) || 50;

    try {
      const basePath = resolvePath(searchPath);
      if (!validatePath(searchPath || '.')) {
        return failure('Path is outside workspace', Date.now() - startTime);
      }

      const pattern = isRegex ? new RegExp(query, 'gi') : null;
      const results: { file: string; line: number; content: string }[] = [];

      // Recursive file search function
      async function searchInDir(dir: string): Promise<void> {
        if (results.length >= maxResults) return;

        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          
          const fullPath = join(dir, entry.name);
          
          // Skip hidden files and node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isDirectory()) {
            await searchInDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                const line = lines[i];
                const matches = pattern ? pattern.test(line) : line.includes(query);
                
                if (matches) {
                  results.push({
                    file: relative(WORKSPACE_ROOT, fullPath),
                    line: i + 1,
                    content: line.trim().substring(0, 200)
                  });
                }
                
                // Reset regex lastIndex for global patterns
                if (pattern) pattern.lastIndex = 0;
              }
            } catch {
              // Skip files that can't be read (binary, etc.)
            }
          }
        }
      }

      await searchInDir(basePath);

      if (results.length === 0) {
        return success('No matches found', Date.now() - startTime, { matchCount: 0 });
      }

      // Format results
      const output = results.map(r => 
        `${r.file}:${r.line}: ${r.content}`
      ).join('\n');

      return success(
        output,
        Date.now() - startTime,
        { matchCount: results.length, truncated: results.length >= maxResults }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Search failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: list_directory
// ============================================================================

const listDirectoryTool: Tool = {
  name: 'list_directory',
  description: 'List files and directories in a path.',
  category: 'file',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Directory path (relative to workspace root, defaults to root)',
      required: false
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'Whether to list recursively',
      required: false,
      default: false
    },
    {
      name: 'max_depth',
      type: 'number',
      description: 'Maximum recursion depth (only if recursive=true)',
      required: false,
      default: 3
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const dirPath = (args.path as string) || '';
    const recursive = (args.recursive as boolean) || false;
    const maxDepth = (args.max_depth as number) || 3;

    try {
      const basePath = resolvePath(dirPath);
      if (!validatePath(dirPath || '.')) {
        return failure('Path is outside workspace', Date.now() - startTime);
      }

      const items: string[] = [];

      async function listDir(dir: string, depth: number, prefix: string = ''): Promise<void> {
        if (depth > maxDepth) return;

        const entries = await readdir(dir, { withFileTypes: true });
        
        // Sort: directories first, then files
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
          // Skip hidden files
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            items.push(`${prefix}${entry.name}/`);
            if (recursive && entry.name !== 'node_modules') {
              await listDir(fullPath, depth + 1, prefix + '  ');
            }
          } else {
            items.push(`${prefix}${entry.name}`);
          }
        }
      }

      await listDir(basePath, 0);

      const output = items.length > 0 
        ? items.join('\n')
        : '(empty directory)';

      return success(output, Date.now() - startTime, { itemCount: items.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to list directory: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Export all file tools
// ============================================================================

export const fileTools: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  listDirectoryTool
];
