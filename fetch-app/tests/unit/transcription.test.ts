import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileMock = vi.fn();
const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const unlinkMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
}));

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    WHISPER_MODEL: '/models/my model.bin',
  },
}));

function installExecFileSuccessMock(): void {
  execFileMock.mockImplementation((file: string, ...rest: unknown[]) => {
    const callback = rest[rest.length - 1] as (err: Error | null, stdout?: string, stderr?: string) => void;
    if (file.includes('whisper-cpp')) {
      callback(null, '', "detect: detected language 'en'");
      return;
    }
    callback(null, '', '');
  });
}

describe('transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue('hello world');
    unlinkMock.mockResolvedValue(undefined);
    existsSyncMock.mockImplementation((path: string) => path === '/usr/local/bin/whisper-cpp' || path === '/models/my model.bin');
    installExecFileSuccessMock();
  });

  it('executes whisper with argument array and preserves model path with spaces', async () => {
    const { transcribeAudio } = await import('../../src/transcription/index.js');

    const result = await transcribeAudio(Buffer.from('abc'), 'voice.ogg');

    expect(result.text).toBe('hello world');
    const whisperCall = execFileMock.mock.calls.find((call) => call[0] === '/usr/local/bin/whisper-cpp');
    expect(whisperCall).toBeDefined();
    expect(whisperCall?.[1]).toEqual(expect.arrayContaining(['-m', '/models/my model.bin']));
  });

  it('fails when model path does not exist', async () => {
    existsSyncMock.mockImplementation((path: string) => path === '/usr/local/bin/whisper-cpp');
    const { transcribeAudio } = await import('../../src/transcription/index.js');

    await expect(transcribeAudio(Buffer.from('abc'), 'voice.ogg')).rejects.toThrow('Transcription failed. Please try again.');
  });
});
