import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

type ExecLike = {
  start: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
};

type ContainerLike = {
  exec: ReturnType<typeof vi.fn>;
};

let mockDockerClient: {
  listContainers: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
  modem: { demuxStream: ReturnType<typeof vi.fn> };
};

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('dockerode', () => ({
  default: class DockerMock {
    constructor(_options?: unknown) {
      return mockDockerClient;
    }
  },
}));

function createIdleStream(): NodeJS.ReadWriteStream {
  const emitter = new EventEmitter() as NodeJS.ReadWriteStream & { destroy: () => void };
  emitter.destroy = vi.fn();
  return emitter;
}

async function loadDockerModule() {
  vi.resetModules();
  return import('../../src/utils/docker.js');
}

describe('docker utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const container: ContainerLike = {
      exec: vi.fn(),
    };

    mockDockerClient = {
      listContainers: vi.fn(async () => [{ Id: 'abc123', State: 'running' }]),
      getContainer: vi.fn(() => container),
      modem: { demuxStream: vi.fn() },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('terminates timed-out docker exec process and returns timeout result', async () => {
    const container = mockDockerClient.getContainer();
    const mainStream = createIdleStream();

    const mainExec: ExecLike = {
      start: vi.fn((opts, cb) => cb(null, mainStream)),
      inspect: vi.fn(async () => ({ Pid: 123 })),
    };

    const killerExec: ExecLike = {
      start: vi.fn((opts, cb) => cb(null, createIdleStream())),
      inspect: vi.fn(async () => ({ ExitCode: 0 })),
    };

    container.exec
      .mockResolvedValueOnce(mainExec)
      .mockResolvedValueOnce(killerExec);

    const { dockerExec } = await loadDockerModule();
    const pending = dockerExec('sleep', ['99'], { timeoutMs: 10 });

    await vi.advanceTimersByTimeAsync(20);
    const result = await pending;

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(container.exec).toHaveBeenCalledTimes(2);
    const killCmd = container.exec.mock.calls[1][0].Cmd[2] as string;
    expect(killCmd).toContain('kill -TERM 123');
  });

  it('passes stdin option through dockerExec and dockerExecStream', async () => {
    const container = mockDockerClient.getContainer();

    const streamExec: ExecLike = {
      start: vi.fn((opts, cb) => {
        const stream = createIdleStream();
        cb(null, stream);
        setTimeout(() => {
          stream.emit('end');
        }, 0);
      }),
      inspect: vi.fn(async () => ({ ExitCode: 0 })),
    };

    container.exec.mockResolvedValue(streamExec);

    const { dockerExec, dockerExecStream } = await loadDockerModule();

    const resultPromise = dockerExec('echo', ['hi'], { stdin: true, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1);
    await resultPromise;

    expect(streamExec.start).toHaveBeenCalledWith({ hijack: true, stdin: true }, expect.any(Function));

    const exitPromise = dockerExecStream('echo', ['hi'], vi.fn(), vi.fn(), { stdin: true, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1);
    await exitPromise;

    expect(streamExec.start).toHaveBeenCalledWith({ hijack: true, stdin: true }, expect.any(Function));
  });
});
