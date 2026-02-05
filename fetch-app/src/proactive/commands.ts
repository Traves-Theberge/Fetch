/**
 * @fileoverview Proactive User Commands
 * 
 * Handles user-facing commands for scheduling and reminders.
 * These functions are intended to be called by the intent system or command parser.
 */

import { getTaskScheduler } from '../task/scheduler.js';
import { nanoid } from 'nanoid';

/**
 * Handle /remind command
 * Format: /remind [message] in [duration]
 * Example: /remind "deploy to prod" in 10m
 */
export async function handleRemindCommand(args: string): Promise<string> {
  // Simple regex parsing: "(.*) in (\d+[smhd])"
  const match = args.match(/(.*)\s+in\s+(\d+[smhd])/i);
  
  if (!match) {
    return "Usage: /remind <message> in <time> (e.g., /remind 'deploy' in 30m)";
  }

  const [_, message, duration] = match;
  const targetTime = parseDurationToFuture(duration);
  const cronExpression = dateToCron(targetTime);

  const scheduler = getTaskScheduler();
  const id = `remind_${nanoid(6)}`;

  scheduler.addJob({
    id,
    schedule: cronExpression,
    command: `echo "REMINDER: ${message.trim()}"`, // Placeholder for actual notification logic
    description: `Reminder: ${message.trim()}`,
    enabled: true
  });

  return `✅ **Reminder set!**\nI'll remind you to "${message.trim()}" at ${targetTime.toLocaleTimeString()}.`;
}

/**
 * Handle /schedule command
 * Format: /schedule [task] at [cron/time]
 */
export async function handleScheduleCommand(_args: string): Promise<string> {
  // Placeholder - complex parsing required for natural language time
  return "Schedule command implementation pending closer integration with natural date parser.";
}

/**
 * Handle /cron list command
 */
export async function handleCronList(): Promise<string> {
  const scheduler = getTaskScheduler();
  const jobs = scheduler.listJobs();

  if (jobs.length === 0) {
    return "No scheduled jobs active.";
  }

  const list = jobs.map(j => 
    `- **${j.id}**: ${j.description} (${j.schedule}) [${j.enabled ? 'ON' : 'OFF'}]`
  ).join('\n');

  return `📅 **Scheduled Jobs**:\n${list}`;
}

/**
 * Handle /cron remove command
 */
export async function handleCronRemove(args: string): Promise<string> {
  // Parsing args: should be just the ID
  const id = args.trim();
  
  if (!id) {
    return "Usage: /cron remove <job_id>";
  }

  const scheduler = getTaskScheduler();
  const removed = scheduler.removeJob(id);

  if (removed) {
    return `✅ Removed job: **${id}**`;
  } else {
    return `❌ Job not found: **${id}**`;
  }
}

// Helpers

function parseDurationToFuture(duration: string): Date {
  const now = Date.now();
  const value = parseInt(duration.slice(0, -1));
  const unit = duration.slice(-1).toLowerCase();
  
  let ms = 0;
  switch (unit) {
    case 's': ms = value * 1000; break;
    case 'm': ms = value * 60 * 1000; break;
    case 'h': ms = value * 60 * 60 * 1000; break;
    case 'd': ms = value * 24 * 60 * 60 * 1000; break;
  }
  
  return new Date(now + ms);
}

function dateToCron(date: Date): string {
  // Convert specific date to one-time cron: "Min Hour Day Month DayOfWeek"
  // Note: Standard cron doesn't support "Year", so this will run every year if not removed.
  // Ideally use a scheduler that supports "Date" triggers, but for now specific cron works.
  return `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
}
