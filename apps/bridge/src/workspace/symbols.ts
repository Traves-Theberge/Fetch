/**
 * @fileoverview Language-aware symbol extraction used by repo-map.
 *
 * Matches exported/declared symbols from source text using regex patterns.
 *
 * @module workspace/symbols
 */

/** Normalized symbol kinds used in repo-map output. */
export type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'const' | 'method' | 'enum';

/** One extracted symbol record. */
export interface SymbolInfo {
  name: string;
  type: SymbolType;
  line?: number;
}

/** Symbol patterns for one language family. */
export interface LanguagePattern {
  extensions: string[];
  patterns: Array<{
    regex: RegExp;
    type: SymbolType;
  }>;
}

/** Regex-based symbol patterns keyed by language. */
export const LANGUAGE_PATTERNS: Record<string, LanguagePattern> = {
  typescript: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    patterns: [
      { regex: /export\s+class\s+([a-zA-Z0-9_$]+)/g, type: 'class' },
      { regex: /export\s+function\s+([a-zA-Z0-9_$]+)/g, type: 'function' },
      { regex: /export\s+interface\s+([a-zA-Z0-9_$]+)/g, type: 'interface' },
      { regex: /export\s+type\s+([a-zA-Z0-9_$]+)/g, type: 'type' },
      { regex: /export\s+const\s+([a-zA-Z0-9_$]+)/g, type: 'const' },
      { regex: /export\s+enum\s+([a-zA-Z0-9_$]+)/g, type: 'enum' },
    ],
  },
  python: {
    extensions: ['.py'],
    patterns: [
      { regex: /^class\s+([a-zA-Z0-9_]+)/gm, type: 'class' },
      { regex: /^def\s+([a-zA-Z0-9_]+)/gm, type: 'function' },
    ],
  },
  go: {
    extensions: ['.go'],
    patterns: [
      { regex: /^func\s+([a-zA-Z0-9_]+)/gm, type: 'function' },
      { regex: /^type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/gm, type: 'type' },
    ],
  },
  rust: {
    extensions: ['.rs'],
    patterns: [
      { regex: /^pub\s+fn\s+([a-zA-Z0-9_]+)/gm, type: 'function' },
      { regex: /^pub\s+struct\s+([a-zA-Z0-9_]+)/gm, type: 'class' },
      { regex: /^pub\s+enum\s+([a-zA-Z0-9_]+)/gm, type: 'enum' },
      { regex: /^pub\s+trait\s+([a-zA-Z0-9_]+)/gm, type: 'interface' },
      { regex: /^pub\s+mod\s+([a-zA-Z0-9_]+)/gm, type: 'const' },
    ],
  },
  java: {
    extensions: ['.java'],
    patterns: [
      { regex: /(?:public|private|protected)\s+class\s+([a-zA-Z0-9_]+)/g, type: 'class' },
      { regex: /(?:public|private|protected)\s+interface\s+([a-zA-Z0-9_]+)/g, type: 'interface' },
      { regex: /(?:public|private|protected)\s+enum\s+([a-zA-Z0-9_]+)/g, type: 'enum' },
    ],
  },
  ruby: {
    extensions: ['.rb'],
    patterns: [
      { regex: /^class\s+([A-Z][a-zA-Z0-9_]*)/gm, type: 'class' },
      { regex: /^module\s+([A-Z][a-zA-Z0-9_]*)/gm, type: 'type' },
      { regex: /^\s*def\s+([a-zA-Z0-9_!?]+)/gm, type: 'function' },
    ],
  },
  php: {
    extensions: ['.php'],
    patterns: [
      { regex: /class\s+([a-zA-Z0-9_]+)/g, type: 'class' },
      { regex: /interface\s+([a-zA-Z0-9_]+)/g, type: 'interface' },
      { regex: /function\s+([a-zA-Z0-9_]+)/g, type: 'function' },
    ],
  },
  dotnet: {
    extensions: ['.cs', '.fs'],
    patterns: [
      { regex: /class\s+([a-zA-Z0-9_]+)/g, type: 'class' },
      { regex: /interface\s+([a-zA-Z0-9_]+)/g, type: 'interface' },
      { regex: /enum\s+([a-zA-Z0-9_]+)/g, type: 'enum' },
    ],
  },
};

/** Extracts symbols for a file based on extension-specific patterns. */
export function extractSymbols(content: string, fileName: string): SymbolInfo[] {
  const ext = '.' + fileName.split('.').pop();
  const lang = Object.keys(LANGUAGE_PATTERNS).find(l => 
    LANGUAGE_PATTERNS[l].extensions.includes(ext)
  );

  if (!lang) return [];

  const symbols: SymbolInfo[] = [];
  const patterns = LANGUAGE_PATTERNS[lang].patterns;

  for (const p of patterns) {
    let match;
    // Reset regex index for global matches
    p.regex.lastIndex = 0;
    while ((match = p.regex.exec(content)) !== null) {
      if (match[1]) {
        symbols.push({
          name: match[1],
          type: p.type
        });
      }
    }
  }

  // Sort and deduplicate by (name, type)
  const deduped = new Map<string, SymbolInfo>();
  for (const symbol of symbols) {
    const key = `${symbol.name}:${symbol.type}`;
    if (!deduped.has(key)) {
      deduped.set(key, symbol);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.type.localeCompare(b.type);
    });
}
