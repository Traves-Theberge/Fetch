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

  it('rejects empty base64 payload', async () => {
    const { analyzeImage } = await loadVision();
    await expect(analyzeImage('', 'image/png')).rejects.toThrow('empty image payload');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only base64 payload', async () => {
    const { analyzeImage } = await loadVision();
    await expect(analyzeImage('   \n  ', 'image/png')).rejects.toThrow('empty image payload');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('accepts allowed image inputs and returns provider response', async () => {
    const { analyzeImage } = await loadVision();
    const result = await analyzeImage('aGVsbG8=', 'image/png', 'debug this screenshot');

    expect(result).toBe('looks good');
    expect(createMock).toHaveBeenCalledOnce();
  });

  it('accepts all four allowed mime types', async () => {
    const { analyzeImage } = await loadVision();
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      });
      const result = await analyzeImage('aGVsbG8=', mime);
      expect(result).toBe('ok');
    }
  });

  it('returns fallback text when API response has no content', async () => {
    const { analyzeImage } = await loadVision();
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    const result = await analyzeImage('aGVsbG8=', 'image/png');
    expect(result).toBe('No analysis available.');
  });

  it('wraps unexpected API errors in a user-friendly message', async () => {
    const { analyzeImage } = await loadVision();
    createMock.mockRejectedValueOnce(new Error('network timeout'));
    await expect(analyzeImage('aGVsbG8=', 'image/png')).rejects.toThrow(
      'Image analysis failed. Please try again or describe the problem in text.'
    );
  });
});

describe('vision availability', () => {
  it('reports vision available when API key is set', async () => {
    const { isVisionAvailable } = await loadVision();
    expect(isVisionAvailable()).toBe(true);
  });
});
