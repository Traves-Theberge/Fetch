
import { describe, it, expect } from 'vitest';
import { redactCommandArgs } from '../../src/harness/spawner';

describe('redactCommandArgs', () => {
    it('should redact OPENAI_API_KEY', () => {
        const input = ['exec', '-e', 'OPENAI_API_KEY=sk-12345', 'fetch-kennel', 'run'];
        const expected = ['exec', '-e', 'OPENAI_API_KEY=REDACTED', 'fetch-kennel', 'run'];
        expect(redactCommandArgs(input)).toEqual(expected);
    });

    it('should redact ANTHROPIC_API_KEY', () => {
        const input = ['exec', '-e', 'ANTHROPIC_API_KEY=sk-ant-123', 'cmd'];
        const expected = ['exec', '-e', 'ANTHROPIC_API_KEY=REDACTED', 'cmd'];
        expect(redactCommandArgs(input)).toEqual(expected);
    });

    it('should redact arbitrary secrets containing SECRET or TOKEN', () => {
        const input = ['-e', 'MY_SECRET=hidden', '-e', 'ACCESS_TOKEN=hidden', 'cmd'];
        const expected = ['-e', 'MY_SECRET=REDACTED', '-e', 'ACCESS_TOKEN=REDACTED', 'cmd'];
        expect(redactCommandArgs(input)).toEqual(expected);
    });

    it('should redact lowercase and mixed-case secret keys', () => {
        const input = ['-e', 'openai_api_key=sk-123', '-e', 'Api_Token=abc', 'cmd'];
        const expected = ['-e', 'openai_api_key=REDACTED', '-e', 'Api_Token=REDACTED', 'cmd'];
        expect(redactCommandArgs(input)).toEqual(expected);
    });

    it('should not redact non-sensitive args', () => {
        const input = ['exec', '-w', '/workspace', '-e', 'CI=true', 'cmd'];
        expect(redactCommandArgs(input)).toEqual(input);
    });

    it('should handle mixed sensitive and non-sensitive args', () => {
        const input = ['exec', '-e', 'CI=true', '-e', 'OPENAI_API_KEY=sk-123', 'cmd'];
        const expected = ['exec', '-e', 'CI=true', '-e', 'OPENAI_API_KEY=REDACTED', 'cmd'];
        expect(redactCommandArgs(input)).toEqual(expected);
    });
});
