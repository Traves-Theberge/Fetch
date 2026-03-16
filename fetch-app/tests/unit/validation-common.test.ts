import { describe, it, expect } from 'vitest';
import {
  TaskIdSchema,
  HarnessIdSchema,
  ProgressIdSchema,
  WorkspaceNameSchema,
  SafePathSchema,
  PositiveIntSchema,
  NonNegativeIntSchema,
  PercentageSchema,
  TimeoutSchema,
  ISOTimestampSchema,
  NonEmptyStringSchema,
  GoalSchema,
  QuestionSchema,
  ResponseSchema,
  ProgressMessageSchema,
  DEFAULT_TIMEOUT_MS,
} from '../../src/validation/common.js';

describe('validation/common schemas', () => {
  // ─── ID Schemas ──────────────────────────────────────────────────────

  describe('TaskIdSchema', () => {
    it('accepts a valid task id', () => {
      expect(TaskIdSchema.safeParse('tsk_AbCd1234_-').success).toBe(true);
    });

    it('rejects ids without tsk_ prefix', () => {
      expect(TaskIdSchema.safeParse('abc_AbCd12345-').success).toBe(false);
    });

    it('rejects ids with wrong length', () => {
      expect(TaskIdSchema.safeParse('tsk_short').success).toBe(false);
      expect(TaskIdSchema.safeParse('tsk_waytoolongvalue').success).toBe(false);
    });

    it('rejects ids with invalid characters', () => {
      expect(TaskIdSchema.safeParse('tsk_AbCd!@#$%-').success).toBe(false);
    });
  });

  describe('HarnessIdSchema', () => {
    it('accepts a valid harness id', () => {
      expect(HarnessIdSchema.safeParse('hrn_AbCd12_-').success).toBe(true);
    });

    it('rejects ids without hrn_ prefix', () => {
      expect(HarnessIdSchema.safeParse('xxx_AbCd12_-').success).toBe(false);
    });

    it('rejects ids with wrong length', () => {
      expect(HarnessIdSchema.safeParse('hrn_short').success).toBe(false);
    });
  });

  describe('ProgressIdSchema', () => {
    it('accepts a valid progress id', () => {
      expect(ProgressIdSchema.safeParse('prg_AbCd12_-').success).toBe(true);
    });

    it('rejects ids without prg_ prefix', () => {
      expect(ProgressIdSchema.safeParse('xxx_AbCd12_-').success).toBe(false);
    });

    it('rejects ids with wrong length', () => {
      expect(ProgressIdSchema.safeParse('prg_short').success).toBe(false);
    });
  });

  // ─── Path Schemas ────────────────────────────────────────────────────

  describe('WorkspaceNameSchema', () => {
    it('accepts valid names and lowercases them', () => {
      const result = WorkspaceNameSchema.safeParse('MyProject');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('myproject');
    });

    it('accepts names with dots, underscores, and hyphens', () => {
      expect(WorkspaceNameSchema.safeParse('my-project_v1.0').success).toBe(true);
    });

    it('rejects empty names', () => {
      expect(WorkspaceNameSchema.safeParse('').success).toBe(false);
    });

    it('rejects names starting with non-alphanumeric', () => {
      expect(WorkspaceNameSchema.safeParse('-project').success).toBe(false);
      expect(WorkspaceNameSchema.safeParse('.project').success).toBe(false);
    });

    it('rejects path traversal in names', () => {
      expect(WorkspaceNameSchema.safeParse('my..project').success).toBe(false);
    });

    it('rejects names exceeding 100 characters', () => {
      expect(WorkspaceNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
    });
  });

  describe('SafePathSchema', () => {
    it('accepts relative paths', () => {
      expect(SafePathSchema.safeParse('src/index.ts').success).toBe(true);
    });

    it('accepts absolute paths under /workspace', () => {
      expect(SafePathSchema.safeParse('/workspace/src/file.ts').success).toBe(true);
    });

    it('rejects path traversal', () => {
      expect(SafePathSchema.safeParse('../etc/passwd').success).toBe(false);
    });

    it('rejects absolute paths outside /workspace', () => {
      expect(SafePathSchema.safeParse('/etc/passwd').success).toBe(false);
    });

    it('rejects empty paths', () => {
      expect(SafePathSchema.safeParse('').success).toBe(false);
    });
  });

  // ─── Numeric Schemas ─────────────────────────────────────────────────

  describe('PositiveIntSchema', () => {
    it('accepts positive integers', () => {
      expect(PositiveIntSchema.safeParse(1).success).toBe(true);
      expect(PositiveIntSchema.safeParse(100).success).toBe(true);
    });

    it('rejects zero and negatives', () => {
      expect(PositiveIntSchema.safeParse(0).success).toBe(false);
      expect(PositiveIntSchema.safeParse(-1).success).toBe(false);
    });

    it('rejects floats', () => {
      expect(PositiveIntSchema.safeParse(1.5).success).toBe(false);
    });
  });

  describe('NonNegativeIntSchema', () => {
    it('accepts zero and positive integers', () => {
      expect(NonNegativeIntSchema.safeParse(0).success).toBe(true);
      expect(NonNegativeIntSchema.safeParse(42).success).toBe(true);
    });

    it('rejects negatives', () => {
      expect(NonNegativeIntSchema.safeParse(-1).success).toBe(false);
    });
  });

  describe('PercentageSchema', () => {
    it('accepts values between 0 and 100', () => {
      expect(PercentageSchema.safeParse(0).success).toBe(true);
      expect(PercentageSchema.safeParse(50).success).toBe(true);
      expect(PercentageSchema.safeParse(100).success).toBe(true);
    });

    it('rejects values outside range', () => {
      expect(PercentageSchema.safeParse(-1).success).toBe(false);
      expect(PercentageSchema.safeParse(101).success).toBe(false);
    });
  });

  describe('TimeoutSchema', () => {
    it('accepts values within 1s to 30m range', () => {
      expect(TimeoutSchema.safeParse(1000).success).toBe(true);
      expect(TimeoutSchema.safeParse(1800000).success).toBe(true);
    });

    it('rejects values below 1 second', () => {
      expect(TimeoutSchema.safeParse(999).success).toBe(false);
    });

    it('rejects values above 30 minutes', () => {
      expect(TimeoutSchema.safeParse(1800001).success).toBe(false);
    });

    it('rejects floats', () => {
      expect(TimeoutSchema.safeParse(1500.5).success).toBe(false);
    });
  });

  // ─── Timestamp Schemas ───────────────────────────────────────────────

  describe('ISOTimestampSchema', () => {
    it('accepts valid ISO-8601 timestamps', () => {
      expect(ISOTimestampSchema.safeParse('2024-01-01T00:00:00Z').success).toBe(true);
      expect(ISOTimestampSchema.safeParse('2024-06-15T12:30:00.000Z').success).toBe(true);
    });

    it('rejects non-ISO strings', () => {
      expect(ISOTimestampSchema.safeParse('not-a-date').success).toBe(false);
      expect(ISOTimestampSchema.safeParse('2024/01/01').success).toBe(false);
    });
  });

  // ─── String Schemas ──────────────────────────────────────────────────

  describe('NonEmptyStringSchema', () => {
    it('accepts non-empty strings', () => {
      expect(NonEmptyStringSchema.safeParse('hello').success).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(NonEmptyStringSchema.safeParse('').success).toBe(false);
    });
  });

  describe('GoalSchema', () => {
    it('accepts valid goal text', () => {
      expect(GoalSchema.safeParse('Add login feature').success).toBe(true);
    });

    it('rejects empty goals', () => {
      expect(GoalSchema.safeParse('').success).toBe(false);
    });

    it('rejects goals over 2000 characters', () => {
      expect(GoalSchema.safeParse('x'.repeat(2001)).success).toBe(false);
    });
  });

  describe('QuestionSchema', () => {
    it('accepts valid questions', () => {
      expect(QuestionSchema.safeParse('What framework?').success).toBe(true);
    });

    it('rejects questions over 500 characters', () => {
      expect(QuestionSchema.safeParse('x'.repeat(501)).success).toBe(false);
    });
  });

  describe('ResponseSchema', () => {
    it('accepts valid responses', () => {
      expect(ResponseSchema.safeParse('Use React').success).toBe(true);
    });

    it('rejects responses over 1000 characters', () => {
      expect(ResponseSchema.safeParse('x'.repeat(1001)).success).toBe(false);
    });
  });

  describe('ProgressMessageSchema', () => {
    it('accepts valid messages', () => {
      expect(ProgressMessageSchema.safeParse('Step 1 done').success).toBe(true);
    });

    it('rejects messages over 500 characters', () => {
      expect(ProgressMessageSchema.safeParse('x'.repeat(501)).success).toBe(false);
    });
  });

  // ─── Constants ────────────────────────────────────────────────────────

  describe('DEFAULT_TIMEOUT_MS', () => {
    it('is 5 minutes (300000ms)', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(300000);
    });
  });
});
