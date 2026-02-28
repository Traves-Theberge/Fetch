import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/agent/notifications.js', () => ({
  formatNotification: vi.fn().mockResolvedValue('Still working on your request'),
}));

vi.mock('../../src/agent/whatsapp-format.js', () => ({
  formatAndChunkForWhatsApp: vi.fn((text: string) => [text]),
}));

const {
  composeTaskProgressMessages,
  composeTaskFileOpMessages,
  composeTaskQuestionMessages,
} = await import('../../src/bridge/progress-message.js');
const { formatNotification } = await import('../../src/agent/notifications.js');
const { formatAndChunkForWhatsApp } = await import('../../src/agent/whatsapp-format.js');

describe('bridge/progress-message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(formatNotification).mockResolvedValue('Still working on your request');
    vi.mocked(formatAndChunkForWhatsApp).mockImplementation((text: string) => [text]);
  });

  it('composes progress notifications through envelope rendering', async () => {
    const chunks = await composeTaskProgressMessages('indexing files', 'ses_1');

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

    const chunks = await composeTaskProgressMessages('running tests', 'ses_2');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Progress Update');
    expect(chunks[0]).toContain('running tests');
  });

  it('composes file operation updates via envelope rendering', () => {
    const chunks = composeTaskFileOpMessages('create', 'src/new-file.ts');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Workspace Update');
    expect(chunks[0]).toContain('Created src/new-file.ts');
  });

  it('composes question updates via envelope rendering', () => {
    const chunks = composeTaskQuestionMessages('Should I open a PR?');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Input Needed');
    expect(chunks[0]).toContain('Should I open a PR?');
    expect(chunks[0]).toContain('Reply to this message');
  });
});
