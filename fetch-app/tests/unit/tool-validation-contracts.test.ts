import { describe, it, expect } from 'vitest';
import { BrowserActionInputSchema } from '../../src/validation/tools.js';

describe('tool validation contracts', () => {
  describe('browser_action', () => {
    it('rejects click without ref and without coordinates', () => {
      const result = BrowserActionInputSchema.safeParse({ action: 'click' });
      expect(result.success).toBe(false);
    });

    it('rejects coordinate click when only one coordinate is provided', () => {
      const result = BrowserActionInputSchema.safeParse({ action: 'click', x: 10 });
      expect(result.success).toBe(false);
    });

    it('accepts click with full coordinate pair', () => {
      const result = BrowserActionInputSchema.safeParse({ action: 'click', x: 10, y: 20 });
      expect(result.success).toBe(true);
    });

    it('rejects type without required ref/text', () => {
      const missingRef = BrowserActionInputSchema.safeParse({ action: 'type', text: 'hello' });
      const missingText = BrowserActionInputSchema.safeParse({ action: 'type', ref: 1 });
      expect(missingRef.success).toBe(false);
      expect(missingText.success).toBe(false);
    });
  });
});
