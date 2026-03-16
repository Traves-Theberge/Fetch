import { describe, expect, it } from 'vitest';
import { validateInput, sanitizePath } from '../../src/security/validator.js';

describe('validateInput', () => {
  it('accepts valid input and trims whitespace', () => {
    const result = validateInput('  hello world  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('hello world');
  });

  it('rejects null/undefined input', () => {
    expect(validateInput(null as unknown as string).valid).toBe(false);
    expect(validateInput(undefined as unknown as string).valid).toBe(false);
  });

  it('rejects empty or whitespace-only input', () => {
    expect(validateInput('').valid).toBe(false);
    expect(validateInput('   ').valid).toBe(false);
    expect(validateInput('').error).toBe('Message too short');
  });

  it('rejects input exceeding max length', () => {
    const long = 'a'.repeat(10001);
    const result = validateInput(long);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });

  it('accepts input at exactly max length', () => {
    const exact = 'a'.repeat(10000);
    expect(validateInput(exact).valid).toBe(true);
  });

  it('rejects command substitution patterns', () => {
    expect(validateInput('$(rm -rf /)').valid).toBe(false);
    expect(validateInput('$(whoami)').error).toBe('Input contains potentially unsafe content');
  });

  it('rejects destructive shell patterns', () => {
    expect(validateInput('; rm -rf /').valid).toBe(false);
    expect(validateInput('cat file | sh').valid).toBe(false);
    expect(validateInput('cat file | bash').valid).toBe(false);
  });

  it('rejects device redirection', () => {
    expect(validateInput('> /dev/null').valid).toBe(false);
  });

  it('rejects eval and prototype pollution', () => {
    expect(validateInput('eval(something)').valid).toBe(false);
    expect(validateInput('__proto__').valid).toBe(false);
    expect(validateInput('constructor[key]').valid).toBe(false);
  });

  it('strips null bytes and control characters', () => {
    const result = validateInput('hello\x00world\x01!');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('helloworld!');
    expect(result.sanitized).not.toContain('\x00');
  });

  it('preserves newlines in sanitized output', () => {
    const result = validateInput('line1\nline2');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toContain('\n');
  });
});

describe('sanitizePath', () => {
  it('normalizes backslashes to forward slashes', () => {
    expect(sanitizePath('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  it('strips drive letter prefixes', () => {
    expect(sanitizePath('C:\\Users\\test')).toBe('Users/test');
  });

  it('removes parent directory traversal segments', () => {
    expect(sanitizePath('../../etc/passwd')).toBe('etc/passwd');
  });

  it('removes current directory segments', () => {
    expect(sanitizePath('./src/./index.ts')).toBe('src/index.ts');
  });

  it('removes leading slashes', () => {
    expect(sanitizePath('/etc/passwd')).toBe('etc/passwd');
  });

  it('strips invalid filename characters', () => {
    expect(sanitizePath('file<name>.txt')).toBe('filename.txt');
  });

  it('handles UNC paths', () => {
    expect(sanitizePath('//server/share/file.txt')).toBe('file.txt');
  });

  it('collapses duplicate slashes', () => {
    expect(sanitizePath('foo///bar//baz')).toBe('foo/bar/baz');
  });

  it('handles empty segments gracefully', () => {
    expect(sanitizePath('/')).toBe('');
  });
});
