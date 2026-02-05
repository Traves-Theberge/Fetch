/**
 * Safety Instincts - Emergency controls that ALWAYS work
 * 
 * These have the highest priority and trigger actions that
 * affect task execution and session state.
 */

import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

/**
 * STOP - Immediately halt the current task
 */
export const stopInstinct: Instinct = {
  name: 'stop',
  description: 'Immediately halt current task',
  triggers: [
    'stop',
    '/stop',
    'cancel',
    '/cancel',
    'abort',
    '/abort',
    'halt',
    '/halt',
  ],
  patterns: [
    /^stop\s*(it|now|that|everything|the task)?!*$/i,
    /^cancel\s*(it|now|that|everything|the task)?!*$/i,
    /^abort\s*(it|now|that|everything|the task)?!*$/i,
    /^(please\s+)?stop!*$/i,
  ],
  priority: 100, // Highest priority - safety first
  enabled: true,
  category: 'safety',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { activeTask, mode } = ctx;

    // If there's an active task, stop it
    if (activeTask && (mode === 'WORKING' || mode === 'WAITING')) {
      return {
        matched: true,
        response: `🛑 **Stopping task**\n\nHalting: "${activeTask.goal || activeTask.description}"\n\n_Task has been stopped. Any uncommitted changes remain in the workspace._`,
        action: { type: 'stop' },
        continueProcessing: false,
      };
    }

    // If in GUARDING mode, cancel the pending operation
    if (mode === 'GUARDING') {
      return {
        matched: true,
        response: `🛑 **Operation Cancelled**\n\n_The pending operation has been cancelled. No changes were made._`,
        action: { type: 'stop' },
        continueProcessing: false,
      };
    }

    // Nothing to stop
    return {
      matched: true,
      response: `🟢 **Nothing to stop**\n\n_No task is currently running._`,
      continueProcessing: false,
    };
  },
};

/**
 * UNDO - Revert the last change (git reset)
 */
export const undoInstinct: Instinct = {
  name: 'undo',
  description: 'Revert last change',
  triggers: [
    'undo',
    '/undo',
    'revert',
    '/revert',
    'rollback',
    '/rollback',
  ],
  patterns: [
    /^undo\s*(it|that|the last (change|commit))?!*$/i,
    /^revert\s*(it|that|the last (change|commit))?!*$/i,
    /^(go|roll)\s*back!*$/i,
    /^undo last$/i,
  ],
  priority: 90,
  enabled: true,
  category: 'safety',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { workspace } = ctx;

    if (!workspace) {
      return {
        matched: true,
        response: `⚠️ **No workspace set**\n\n_I need a workspace to undo changes. Use \`/workspace <path>\` first._`,
        continueProcessing: false,
      };
    }

    // This triggers the undo action which will be handled by the task manager
    return {
      matched: true,
      response: `↩️ **Reverting last change**\n\n_Running \`git reset --soft HEAD~1\` to undo the last commit..._`,
      action: { type: 'undo' },
      continueProcessing: false,
    };
  },
};

/**
 * CLEAR - Reset session state
 */
export const clearInstinct: Instinct = {
  name: 'clear',
  description: 'Clear/reset session state',
  triggers: [
    'clear',
    '/clear',
    'reset',
    '/reset',
    'start over',
    'fresh start',
  ],
  patterns: [
    /^clear\s*(session|history|context|everything)?$/i,
    /^reset\s*(session|history|context|everything)?$/i,
    /^start\s*(over|fresh|again)$/i,
    /^new\s+session$/i,
  ],
  priority: 80,
  enabled: true,
  category: 'safety',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { activeTask, mode } = ctx;

    // Warn if task is running
    if (activeTask && mode === 'WORKING') {
      return {
        matched: true,
        response: `⚠️ **Task in progress**\n\n_A task is currently running. Use \`/stop\` first, then \`/clear\`._`,
        continueProcessing: false,
      };
    }

    return {
      matched: true,
      response: `🔄 **Session cleared**\n\n_Conversation history cleared. Memory and preferences are preserved._\n\nReady for a fresh start! 🐾`,
      action: { type: 'clear' },
      continueProcessing: false,
    };
  },
};

/**
 * PAUSE - Pause current task (if supported)
 */
export const pauseInstinct: Instinct = {
  name: 'pause',
  description: 'Pause current task',
  triggers: [
    'pause',
    '/pause',
    'wait',
    'hold on',
    'hold',
  ],
  patterns: [
    /^pause\s*(it|the task)?$/i,
    /^(wait|hold)\s*(a\s*)?(sec|second|minute|moment)?$/i,
  ],
  priority: 85,
  enabled: true,
  category: 'control',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { activeTask, mode } = ctx;

    if (activeTask && mode === 'WORKING') {
      return {
        matched: true,
        response: `⏸️ **Task paused**\n\n_The current task has been paused. Use \`/resume\` to continue._`,
        action: { type: 'pause' },
        continueProcessing: false,
      };
    }

    return {
      matched: true,
      response: `🟢 **Nothing to pause**\n\n_No task is currently running._`,
      continueProcessing: false,
    };
  },
};

/**
 * RESUME - Resume paused task
 */
export const resumeInstinct: Instinct = {
  name: 'resume',
  description: 'Resume paused task',
  triggers: [
    'resume',
    '/resume',
    'continue',
    '/continue',
    'go on',
    'proceed',
  ],
  patterns: [
    /^resume\s*(it|the task)?$/i,
    /^continue\s*(it|the task)?$/i,
    /^(go|carry)\s+on$/i,
  ],
  priority: 85,
  enabled: true,
  category: 'control',

  handler: (_ctx: InstinctContext): InstinctResponse => {
    // Note: Actual pause state would need to be tracked
    // For now, this acknowledges the command
    return {
      matched: true,
      response: `▶️ **Resuming**\n\n_Continuing where we left off..._`,
      action: { type: 'resume' },
      continueProcessing: false,
    };
  },
};
