/**
 * @fileoverview Stream processing utilities
 *
 * Provides utilities for working with Node.js streams, including
 * buffering, line splitting, and async iteration.
 *
 * @module utils/stream
 * @see {@link HarnessExecutor} - Uses this for output processing
 * @see {@link OutputParser} - Stream-based output parsing
 *
 * ## Usage
 *
 * ```typescript
 * import { lineStream, collectStream, streamToString } from './utils/stream.js';
 *
 * // Process lines as they arrive
 * for await (const line of lineStream(process.stdout)) {
 *   console.log('Line:', line);
 * }
 *
 * // Collect entire stream
 * const output = await streamToString(process.stdout);
 * ```
 */

import { Readable, Transform, TransformCallback, Writable } from 'stream';

// ============================================================================
// Types
// ============================================================================

/**
 * Stream chunk handler
 */
export type ChunkHandler = (chunk: string) => void;

/**
 * Line handler
 */
export type LineHandler = (line: string) => void;

/**
 * Stream collection options
 */
export interface CollectOptions {
  /** Maximum size to collect (bytes) */
  maxSize?: number;
  /** Encoding for string conversion */
  encoding?: BufferEncoding;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default maximum stream size (10MB)
 */
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

/**
 * Default encoding
 */
const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

// ============================================================================
// Stream Collection
// ============================================================================

/**
 * Collect a readable stream into a string
 *
 * @param stream - Readable stream
 * @param options - Collection options
 * @returns Collected string
 *
 * @example
 * ```typescript
 * const output = await streamToString(process.stdout);
 * console.log(output);
 * ```
 */
export async function streamToString(
  stream: Readable,
  options: CollectOptions = {}
): Promise<string> {
  const { maxSize = DEFAULT_MAX_SIZE, encoding = DEFAULT_ENCODING } = options;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    stream.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize <= maxSize) {
        chunks.push(chunk);
      }
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString(encoding));
    });

    stream.on('error', reject);
  });
}

/**
 * Collect a readable stream into a buffer
 *
 * @param stream - Readable stream
 * @param maxSize - Maximum size to collect
 * @returns Collected buffer
 */
export async function streamToBuffer(
  stream: Readable,
  maxSize: number = DEFAULT_MAX_SIZE
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    stream.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize <= maxSize) {
        chunks.push(chunk);
      }
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', reject);
  });
}

// ============================================================================
// Line Processing
// ============================================================================

/**
 * Create an async iterator that yields lines from a stream
 *
 * @param stream - Readable stream
 * @returns Async iterable of lines
 *
 * @example
 * ```typescript
 * for await (const line of lineStream(readable)) {
 *   console.log('Line:', line);
 * }
 * ```
 */
export async function* lineStream(stream: Readable): AsyncGenerator<string> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      yield line;
    }
  }

  // Yield remaining buffer if non-empty
  if (buffer) {
    yield buffer;
  }
}

/**
 * Transform stream that splits input into lines
 *
 * @returns Transform stream that emits lines
 *
 * @example
 * ```typescript
 * readable
 *   .pipe(createLineTransform())
 *   .on('data', (line) => console.log(line));
 * ```
 */
export function createLineTransform(): Transform {
  let buffer = '';

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      buffer += chunk.toString();

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        this.push(line);
      }

      callback();
    },

    flush(callback: TransformCallback) {
      if (buffer) {
        this.push(buffer);
      }
      callback();
    },
  });
}

/**
 * Process stream line by line with a callback
 *
 * @param stream - Readable stream
 * @param handler - Line handler
 * @returns Promise that resolves when stream ends
 *
 * @example
 * ```typescript
 * await processLines(readable, (line) => {
 *   console.log('Line:', line);
 * });
 * ```
 */
export async function processLines(
  stream: Readable,
  handler: LineHandler
): Promise<void> {
  for await (const line of lineStream(stream)) {
    handler(line);
  }
}

// ============================================================================
// Stream Utilities
// ============================================================================

/**
 * Create a writable stream that collects data
 *
 * @param onData - Callback for each chunk
 * @returns Writable stream
 */
export function createCollector(onData?: ChunkHandler): Writable & { getData(): string } {
  let data = '';

  const writable = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      const text = chunk.toString();
      data += text;
      onData?.(text);
      callback();
    },
  });

  // Add getData method
  (writable as Writable & { getData(): string }).getData = () => data;

  return writable as Writable & { getData(): string };
}

/**
 * Pipe a stream with a timeout
 *
 * @param source - Source stream
 * @param destination - Destination stream
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that resolves when pipe completes
 */
export async function pipeWithTimeout(
  source: Readable,
  destination: Writable,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      source.destroy();
      reject(new Error(`Stream timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    source.pipe(destination);

    source.on('end', () => {
      clearTimeout(timeout);
      resolve();
    });

    source.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Create a passthrough stream that calls a handler for each chunk
 *
 * @param handler - Chunk handler
 * @returns Transform stream
 */
export function createTap(handler: ChunkHandler): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      handler(chunk.toString());
      this.push(chunk);
      callback();
    },
  });
}

/**
 * Merge multiple readable streams into one
 *
 * @param streams - Streams to merge
 * @returns Merged readable stream
 */
export function mergeStreams(...streams: Readable[]): Readable {
  const merged = new Readable({
    read() {},
  });

  let activeStreams = streams.length;

  for (const stream of streams) {
    stream.on('data', (chunk) => {
      merged.push(chunk);
    });

    stream.on('end', () => {
      activeStreams--;
      if (activeStreams === 0) {
        merged.push(null);
      }
    });

    stream.on('error', (err) => {
      merged.destroy(err);
    });
  }

  return merged;
}

// ============================================================================
// Buffer Utilities
// ============================================================================

/**
 * Ring buffer for maintaining a fixed-size history
 */
export class RingBuffer {
  private buffer: string[] = [];
  private maxLines: number;

  /**
   * Create a ring buffer
   *
   * @param maxLines - Maximum number of lines to keep
   */
  constructor(maxLines: number = 1000) {
    this.maxLines = maxLines;
  }

  /**
   * Add a line to the buffer
   *
   * @param line - Line to add
   */
  push(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length > this.maxLines) {
      this.buffer.shift();
    }
  }

  /**
   * Get all lines
   *
   * @returns Array of lines
   */
  getLines(): string[] {
    return [...this.buffer];
  }

  /**
   * Get last N lines
   *
   * @param n - Number of lines
   * @returns Array of lines
   */
  getLastLines(n: number): string[] {
    return this.buffer.slice(-n);
  }

  /**
   * Get all content as string
   *
   * @returns Joined string
   */
  toString(): string {
    return this.buffer.join('\n');
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get buffer size
   */
  get length(): number {
    return this.buffer.length;
  }
}
