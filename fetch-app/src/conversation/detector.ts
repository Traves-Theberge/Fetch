/**
 * @fileoverview Mode Detector
 * 
 * Analyzes user messages to determine the most appropriate conversation mode.
 * Uses keyword matching, pattern recognition, and heuristics.
 */

import { ConversationMode, ModeDetectionResult } from './types.js';

export class ModeDetector {
  /**
   * Detect the mode of a given message
   */
  public detect(message: string, _currentMode?: ConversationMode): ModeDetectionResult {
    const text = message.toLowerCase();

    // 1. Task Signals (High priority)
    if (this.hasTaskSignals(text)) {
      return { mode: 'TASK', confidence: 0.9, signals: ['explicit_task_keywords'] };
    }

    // 2. Exploration/Questioning Signals
    if (this.hasExplorationSignals(text)) {
      return { mode: 'EXPLORATION', confidence: 0.8, signals: ['exploration_keywords'] };
    }

    // 3. Teaching/Explanation Signals
    if (this.hasTeachingSignals(text)) {
      return { mode: 'TEACHING', confidence: 0.7, signals: ['teaching_keywords'] };
    }

    // 4. Collaboration Signals (Subtle, often implied by "we", "let's")
    if (this.hasCollaborationSignals(text)) {
      return { mode: 'COLLABORATION', confidence: 0.6, signals: ['collaboration_keywords'] };
    }

    // Default to CHAT
    return { mode: 'CHAT', confidence: 0.5, signals: ['default'] };
  }

  private hasTaskSignals(text: string): boolean {
    const keywords = [
      'create', 'update', 'delete', 'fix', 'implement', 'refactor', 
      'change', 'modify', 'run', 'execute', 'test', 'deploy',
      'task:', 'do this'
    ];
    return keywords.some(k => text.includes(k));
  }

  private hasExplorationSignals(text: string): boolean {
    const keywords = [
      'what is', 'how does', 'explain', 'show me', 'list', 
      'where is', 'search for', 'find', 'documentation', 'status'
    ];
    return keywords.some(k => text.includes(k) && !text.includes('task'));
  }

  private hasTeachingSignals(text: string): boolean {
    const keywords = [
      'teach me', 'how to use', 'guide me', 'tutorial', 'concept'
    ];
    return keywords.some(k => text.includes(k));
  }

  private hasCollaborationSignals(text: string): boolean {
    const keywords = [
      "let's", "we should", "what if", "brainstorm", "think about"
    ];
    return keywords.some(k => text.includes(k));
  }
}

export const modeDetector = new ModeDetector();
