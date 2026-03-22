import { describe, expect, it } from 'vitest';
import { Readable } from 'stream';
import http from 'http';
import {
  SessionIdSchema,
  SessionListQuerySchema,
  ConfigReloadBodySchema,
  LogoutBodySchema,
  WhatsAppStartBodySchema,
  WhatsAppRestartBodySchema,
  SessionClearBodySchema,
  formatZodErrors,
  parseQueryString,
  MAX_BODY_SIZE,
} from '../../src/validation/api.js';
import {
  readJsonBody,
  validateBody,
  validateSessionId,
  BodyTooLargeError,
  InvalidContentTypeError,
  MalformedJsonError,
} from '../../src/api/status.js';
import { z } from 'zod';

// =============================================================================
// Helpers
// =============================================================================

/** Build a fake IncomingMessage from raw parts. */
function fakeRequest(options: {
  body?: string;
  contentType?: string;
  contentLength?: number;
}): http.IncomingMessage {
  const { body = '', contentType, contentLength } = options;
  const stream = new Readable({
    read() {
      if (body) this.push(Buffer.from(body));
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;

  stream.headers = {} as http.IncomingHttpHeaders;
  if (contentType !== undefined) {
    stream.headers['content-type'] = contentType;
  }
  stream.headers['content-length'] = String(
    contentLength ?? Buffer.byteLength(body),
  );
  return stream;
}

/** Capture response status + body from a fake ServerResponse. */
class FakeResponse {
  statusCode = 0;
  body = '';
  private _headers: Record<string, string> = {};

  asServerResponse(): http.ServerResponse {
    const self = this;
    return {
      writeHead(code: number) {
        self.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        self._headers[name] = value;
        return this;
      },
      end(data?: string) {
        self.body = data ?? '';
      },
    } as unknown as http.ServerResponse;
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.body);
  }
}

// =============================================================================
// SessionIdSchema
// =============================================================================

describe('SessionIdSchema', () => {
  it('accepts valid session IDs', () => {
    expect(SessionIdSchema.safeParse('abc123').success).toBe(true);
    expect(SessionIdSchema.safeParse('ses_abc-123').success).toBe(true);
    expect(SessionIdSchema.safeParse('A_B-C_9').success).toBe(true);
    expect(SessionIdSchema.safeParse('a').success).toBe(true);
  });

  it('rejects empty string', () => {
    const result = SessionIdSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects strings with slashes', () => {
    expect(SessionIdSchema.safeParse('abc/123').success).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(SessionIdSchema.safeParse('abc 123').success).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(SessionIdSchema.safeParse('../etc/passwd').success).toBe(false);
  });

  it('rejects special characters', () => {
    expect(SessionIdSchema.safeParse('abc@123').success).toBe(false);
    expect(SessionIdSchema.safeParse('abc#123').success).toBe(false);
    expect(SessionIdSchema.safeParse('abc\n123').success).toBe(false);
  });

  it('rejects strings exceeding 128 characters', () => {
    const longId = 'a'.repeat(129);
    expect(SessionIdSchema.safeParse(longId).success).toBe(false);
  });

  it('accepts strings up to 128 characters', () => {
    const maxId = 'a'.repeat(128);
    expect(SessionIdSchema.safeParse(maxId).success).toBe(true);
  });
});

// =============================================================================
// SessionListQuerySchema
// =============================================================================

describe('SessionListQuerySchema', () => {
  it('accepts empty query (defaults)', () => {
    const result = SessionListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data!.limit).toBeUndefined();
  });

  it('accepts valid limit', () => {
    const result = SessionListQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    expect(result.data!.limit).toBe(50);
  });

  it('rejects limit of 0', () => {
    const result = SessionListQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 1000', () => {
    const result = SessionListQuerySchema.safeParse({ limit: '1001' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric limit', () => {
    const result = SessionListQuerySchema.safeParse({ limit: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects fractional limit', () => {
    const result = SessionListQuerySchema.safeParse({ limit: '3.5' });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Strict body schemas (reject unknown keys)
// =============================================================================

describe('Strict body schemas', () => {
  const schemas = [
    { name: 'ConfigReloadBodySchema', schema: ConfigReloadBodySchema },
    { name: 'LogoutBodySchema', schema: LogoutBodySchema },
    { name: 'WhatsAppStartBodySchema', schema: WhatsAppStartBodySchema },
    { name: 'WhatsAppRestartBodySchema', schema: WhatsAppRestartBodySchema },
    { name: 'SessionClearBodySchema', schema: SessionClearBodySchema },
  ];

  for (const { name, schema } of schemas) {
    it(`${name} accepts empty object`, () => {
      expect(schema.safeParse({}).success).toBe(true);
    });

    it(`${name} accepts undefined`, () => {
      expect(schema.safeParse(undefined).success).toBe(true);
    });

    it(`${name} rejects unknown keys`, () => {
      const result = schema.safeParse({ foo: 'bar' });
      expect(result.success).toBe(false);
    });
  }
});

// =============================================================================
// formatZodErrors
// =============================================================================

describe('formatZodErrors', () => {
  it('formats single error without path', () => {
    const result = z.string().min(1).safeParse('');
    expect(result.success).toBe(false);
    const msg = formatZodErrors(result.error!);
    expect(msg.length).toBeGreaterThan(0);
  });

  it('formats error with path', () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    const msg = formatZodErrors(result.error!);
    expect(msg).toContain('name');
  });

  it('joins multiple errors with semicolons', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = schema.safeParse({ a: 123, b: 'x' });
    expect(result.success).toBe(false);
    const msg = formatZodErrors(result.error!);
    expect(msg).toContain(';');
  });
});

// =============================================================================
// parseQueryString
// =============================================================================

describe('parseQueryString', () => {
  it('returns empty object when no query string', () => {
    expect(parseQueryString('/api/sessions')).toEqual({});
  });

  it('parses single parameter', () => {
    expect(parseQueryString('/api/sessions?limit=50')).toEqual({ limit: '50' });
  });

  it('parses multiple parameters', () => {
    expect(parseQueryString('/api/sessions?limit=50&offset=10')).toEqual({
      limit: '50',
      offset: '10',
    });
  });

  it('handles key without value', () => {
    expect(parseQueryString('/path?flag')).toEqual({ flag: '' });
  });

  it('decodes URI components', () => {
    expect(parseQueryString('/path?name=hello%20world')).toEqual({
      name: 'hello world',
    });
  });
});

// =============================================================================
// readJsonBody
// =============================================================================

describe('readJsonBody', () => {
  it('returns undefined for empty body', async () => {
    const req = fakeRequest({ body: '' });
    const result = await readJsonBody(req);
    expect(result).toBeUndefined();
  });

  it('parses valid JSON body', async () => {
    const req = fakeRequest({
      body: '{"key":"value"}',
      contentType: 'application/json',
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON with charset in content-type', async () => {
    const req = fakeRequest({
      body: '{"ok":true}',
      contentType: 'application/json; charset=utf-8',
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: true });
  });

  it('throws MalformedJsonError for invalid JSON', async () => {
    const req = fakeRequest({
      body: '{not json}',
      contentType: 'application/json',
    });
    await expect(readJsonBody(req)).rejects.toThrow(MalformedJsonError);
  });

  it('throws InvalidContentTypeError for wrong content type', async () => {
    const req = fakeRequest({
      body: '{"key":"value"}',
      contentType: 'text/plain',
    });
    await expect(readJsonBody(req)).rejects.toThrow(InvalidContentTypeError);
  });

  it('throws InvalidContentTypeError for missing content type', async () => {
    const req = fakeRequest({ body: '{"key":"value"}' });
    await expect(readJsonBody(req)).rejects.toThrow(InvalidContentTypeError);
  });

  it('throws BodyTooLargeError when content-length exceeds max', async () => {
    const req = fakeRequest({
      body: '{}',
      contentType: 'application/json',
      contentLength: MAX_BODY_SIZE + 1,
    });
    await expect(readJsonBody(req)).rejects.toThrow(BodyTooLargeError);
  });

  it('throws BodyTooLargeError when streaming data exceeds max', async () => {
    const largeBody = 'x'.repeat(MAX_BODY_SIZE + 100);
    const req = fakeRequest({
      body: largeBody,
      contentType: 'application/json',
      contentLength: 10, // Lie about content-length
    });
    await expect(readJsonBody(req)).rejects.toThrow(BodyTooLargeError);
  });
});

// =============================================================================
// validateBody
// =============================================================================

describe('validateBody', () => {
  it('returns validated data on success', () => {
    const fake = new FakeResponse();
    const schema = z.object({ name: z.string() });
    const result = validateBody({ name: 'test' }, schema, fake.asServerResponse());
    expect(result).toEqual({ name: 'test' });
    expect(fake.statusCode).toBe(0); // no response sent
  });

  it('sends 400 and returns null on validation failure', () => {
    const fake = new FakeResponse();
    const schema = z.object({ name: z.string() });
    const result = validateBody({ name: 123 }, schema, fake.asServerResponse());
    expect(result).toBeNull();
    expect(fake.statusCode).toBe(400);
    const body = fake.json();
    expect(body.success).toBe(false);
    expect((body.message as string)).toContain('Validation error');
  });

  it('sends descriptive error for strict body with unknown keys', () => {
    const fake = new FakeResponse();
    const result = validateBody(
      { unexpected: 'field' },
      LogoutBodySchema,
      fake.asServerResponse(),
    );
    expect(result).toBeNull();
    expect(fake.statusCode).toBe(400);
    expect((fake.json().message as string)).toContain('Validation error');
  });
});

// =============================================================================
// validateSessionId
// =============================================================================

describe('validateSessionId', () => {
  it('returns session ID on success', () => {
    const fake = new FakeResponse();
    const result = validateSessionId('abc123', fake.asServerResponse());
    expect(result).toBe('abc123');
    expect(fake.statusCode).toBe(0);
  });

  it('sends 400 for undefined session ID', () => {
    const fake = new FakeResponse();
    const result = validateSessionId(undefined, fake.asServerResponse());
    expect(result).toBeNull();
    expect(fake.statusCode).toBe(400);
    expect((fake.json().message as string)).toContain('Missing session ID');
  });

  it('sends 400 for invalid session ID', () => {
    const fake = new FakeResponse();
    const result = validateSessionId('abc/123', fake.asServerResponse());
    expect(result).toBeNull();
    expect(fake.statusCode).toBe(400);
    expect((fake.json().message as string)).toContain('Invalid session ID');
  });

  it('sends 400 for empty session ID', () => {
    const fake = new FakeResponse();
    const result = validateSessionId('', fake.asServerResponse());
    expect(result).toBeNull();
    expect(fake.statusCode).toBe(400);
  });

  it('sends descriptive error for special characters', () => {
    const fake = new FakeResponse();
    validateSessionId('../etc/passwd', fake.asServerResponse());
    expect(fake.statusCode).toBe(400);
    const msg = (fake.json().message as string);
    expect(msg).toContain('alphanumeric');
  });
});

// =============================================================================
// Error classes
// =============================================================================

describe('Error classes', () => {
  it('BodyTooLargeError has descriptive message', () => {
    const err = new BodyTooLargeError();
    expect(err.message).toContain('too large');
    expect(err.message).toContain(String(MAX_BODY_SIZE));
    expect(err.name).toBe('BodyTooLargeError');
  });

  it('InvalidContentTypeError includes received content type', () => {
    const err = new InvalidContentTypeError('text/plain');
    expect(err.message).toContain('text/plain');
    expect(err.message).toContain('application/json');
    expect(err.name).toBe('InvalidContentTypeError');
  });

  it('InvalidContentTypeError handles empty content type', () => {
    const err = new InvalidContentTypeError('');
    expect(err.message).toContain('Missing');
    expect(err.name).toBe('InvalidContentTypeError');
  });

  it('MalformedJsonError has descriptive message', () => {
    const err = new MalformedJsonError();
    expect(err.message).toContain('Malformed JSON');
    expect(err.name).toBe('MalformedJsonError');
  });
});
