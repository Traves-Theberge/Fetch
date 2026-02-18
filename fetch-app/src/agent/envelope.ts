/**
 * @fileoverview Structured response envelope used before final WhatsApp rendering.
 *
 * @module agent/envelope
 */

import type { ToolResult } from '../tools/types.js';

export type ResponseKind =
  | 'greeting'
  | 'capability'
  | 'status'
  | 'action_result'
  | 'error'
  | 'clarification'
  | 'progress';

export type Severity = 'info' | 'success' | 'warning' | 'error';
export type ConversationalMode = 'direct' | 'conversational';

export interface ResponseFact {
  label: string;
  value: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ResponseAction {
  verb: string;
  target?: string;
  outcome: 'done' | 'skipped' | 'failed';
  detail?: string;
}

export interface ResponseOption {
  id: string;
  label: string;
}

export interface ResponseEnvelope {
  kind: ResponseKind;
  severity: Severity;
  mode: ConversationalMode;
  emojiLevel: 'low' | 'normal';
  title?: string;
  summary: string;
  facts?: ResponseFact[];
  actions?: ResponseAction[];
  options?: ResponseOption[];
  ask?: string;
  rawToolRefs?: string[];
}

interface ToolEnvelopeOptions {
  kind: ResponseKind;
  mode?: ConversationalMode;
  title?: string;
  successAsk?: string;
  failureAsk?: string;
  rawToolRef?: string;
}

/**
 * Convert a tool result to a structured envelope for consistent rendering.
 */
export function envelopeFromToolResult(
  result: ToolResult,
  options: ToolEnvelopeOptions
): ResponseEnvelope {
  const successSummary = result.summary?.trim() || result.output?.trim() || 'Done.';
  const failureSummary = result.error?.trim() || result.output?.trim() || 'Operation failed.';
  const success = result.success;

  return {
    kind: success ? options.kind : 'error',
    severity: success ? 'success' : 'warning',
    mode: options.mode ?? 'conversational',
    emojiLevel: 'normal',
    title: options.title,
    summary: success ? successSummary : failureSummary,
    ask: success ? options.successAsk : options.failureAsk,
    rawToolRefs: options.rawToolRef ? [options.rawToolRef] : undefined,
  };
}

