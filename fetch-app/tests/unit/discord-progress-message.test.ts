import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/agent/notifications.js', () => ({
  formatNotification: vi.fn().mockResolvedValue('Still working on your request'),
}));

vi.mock('../../src/agent/discord-format.js', () => ({
  formatAndChunkForDiscord: vi.fn((text: string) => [text]),
}));

const {
  composeDiscordTaskProgressMessages,
  composeDiscordTaskFileOpMessages,
  composeDiscordTaskQuestionMessages,
} = await import('../../src/bridge/discord-progress-message.js');
const { formatNotification } = await import('../../src/agent/notifications.js');
const { formatAndChunkForDiscord } = await import('../../src/agent/discord-format.js');

describe('bridge/discord-progress-message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(formatNotification).mockResolvedValue('Still working on your request');
    vi.mocked(formatAndChunkForDiscord).mockImplementation((text: string) => [text]);
  });

  it('composes progress notifications through envelope rendering', async () => {
    const chunks = await composeDiscordTaskProgressMessages('indexing files', 'ses_1');

    expect(formatNotification).toHaveBeenCalledWith('task:progress', {
      message: 'indexing files',
      scopeKey: 'ses_1',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Progress Update');
    expect(chunks[0]).toContain('Still working on your request');
  });

  it('falls back to raw progress text when formatter errors', async () => {
    vi.mocked(formatNotification).mockRejectedValueOnce(new Error('timeout'));

    const chunks = await composeDiscordTaskProgressMessages('running tests', 'ses_2');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Progress Update');
    expect(chunks[0]).toContain('running tests');
  });

  it('composes file operation updates via envelope rendering', () => {
    const chunks = composeDiscordTaskFileOpMessages('create', 'src/new-file.ts');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Workspace Update');
    expect(chunks[0]).toContain('Created src/new-file.ts');
  });

  it('composes question updates via envelope rendering', () => {
    const chunks = composeDiscordTaskQuestionMessages('Should I open a PR?');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Input Needed');
    expect(chunks[0]).toContain('Should I open a PR?');
    expect(chunks[0]).toContain('Reply to this message');
  });

  it('returns empty array for empty messages', async () => {
    const chunks = await composeDiscordTaskProgressMessages('', 'ses_3');
    expect(chunks).toEqual([]);
  });

  it('returns empty array for empty questions', () => {
    const chunks = composeDiscordTaskQuestionMessages('');
    expect(chunks).toEqual([]);
  });
});
