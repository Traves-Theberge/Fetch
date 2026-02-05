/**
 * Proactive System Types
 */

// ===================================
// Polling Types
// ===================================

export interface PollingTask {
  id: string;
  name: string;
  intervalMs: number;
  lastRun: number;
  handler: () => Promise<void>;
  enabled: boolean;
  type: 'interval' | 'cron'; // Simple interval or cron schedule
  cronExpression?: string;
}

export interface PollingConfig {
  defaultInterval: number;
  maxTasks: number;
}
