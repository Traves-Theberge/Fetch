import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-key',
    VISION_MODEL: 'vision-test-model',
  },
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

async function loadVision() {
  vi.resetModules();
  return import('../../src/vision/index.js');
}

describe('vision input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'looks good' } }],
    });
  });

  it('rejects unsupported mime types before provider call', async () => {
    const { analyzeImage } = await loadVision();
    await expect(analyzeImage('aGVsbG8=', 'application/pdf')).rejects.toThrow('unsupported mime type');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads before provider call', async () => {
    const { analyzeImage } = await loadVision();
    const oversize = 'A'.repeat(7_200_000);

    await expect(analyzeImage(oversize, 'image/png')).rejects.toThrow('payload too large');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('accepts allowed image inputs and returns provider response', async () => {
    const { analyzeImage } = await loadVision();
    const result = await analyzeImage('aGVsbG8=', 'image/png', 'debug this screenshot');

    expect(result).toBe('looks good');
    expect(createMock).toHaveBeenCalledOnce();
  });
});
