import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it('logs debug messages via console.log', () => {
    logger.debug('test debug');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('test debug');
  });

  it('logs info messages via console.log', () => {
    logger.info('test info');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('test info');
  });

  it('logs warn messages via console.warn', () => {
    logger.warn('test warn');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('test warn');
  });

  it('logs error messages via console.error', () => {
    logger.error('test error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('test error');
  });

  it('logs success messages via console.log', () => {
    logger.success('test success');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('test success');
  });

  it('logs message-level via console.log', () => {
    logger.message('test msg');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('test msg');
  });

  it('includes structured data as string', () => {
    logger.info('payload', { key: 'value' });
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('key');
    expect(output).toContain('value');
  });

  it('formats Error data to message string', () => {
    logger.info('err data', new Error('boom'));
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('boom');
  });

  it('respects LOG_LEVEL filtering', () => {
    process.env.LOG_LEVEL = 'warn';
    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('should appear');
    logger.error('should appear');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('section prints a banner', () => {
    logger.section('My Section');
    expect(logSpy).toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('My Section');
  });

  it('divider prints a line', () => {
    logger.divider();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('─');
  });
});
