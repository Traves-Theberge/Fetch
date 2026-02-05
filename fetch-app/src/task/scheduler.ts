/**
 * @fileoverview Task Scheduler
 * 
 * Handles reliable task scheduling using cron expressions.
 * Allows defining tasks that run repeatedly at specific times.
 * 
 * @module task/scheduler
 */

import { CronJob } from './types.js';
import { logger } from '../utils/logger.js';
import { CronExpressionParser } from 'cron-parser';

export class TaskScheduler {
  private static instance: TaskScheduler | undefined;
  private jobs: Map<string, CronJob> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  public static getInstance(): TaskScheduler {
    if (!TaskScheduler.instance) {
      TaskScheduler.instance = new TaskScheduler();
    }
    return TaskScheduler.instance as TaskScheduler;
  }

  /**
   * Start the scheduler
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    logger.info('Starting task scheduler...');
    
    // Check every minute
    this.timer = setInterval(() => this.checkJobs(), 60000);
    this.checkJobs(); // Initial check
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Task scheduler stopped');
  }

  /**
   * Register a new cron job
   */
  public addJob(job: CronJob): void {
    // Validate cron expression
    try {
      CronExpressionParser.parse(job.schedule);
    } catch {
      logger.error(`Invalid cron expression for job ${job.id}: ${job.schedule}`);
      return;
    }

    const nextRun = this.calculateNextRun(job.schedule);
    const jobWithNext = { ...job, nextRun };
    
    this.jobs.set(job.id, jobWithNext);
    logger.info(`Registered cron job: ${job.id} (${job.schedule}) - Next run: ${new Date(nextRun).toISOString()}`);
  }

  private calculateNextRun(schedule: string): number {
    try {
      const interval = CronExpressionParser.parse(schedule);
      return interval.next().getTime();
    } catch {
      return Date.now() + 86400000; // Fallback 24h
    }
  }

  private async checkJobs(): Promise<void> {
    const now = Date.now();
    
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      
      if (job.nextRun && now >= job.nextRun) {
        await this.triggerJob(job.id);
        
        // Schedule next run
        job.lastRun = now;
        job.nextRun = this.calculateNextRun(job.schedule);
        this.jobs.set(job.id, job); // Update
      }
    }
  }

  /**
   * Remove a job
   */

  /**
   * Remove a job
   */
  public removeJob(jobId: string): boolean {
      return this.jobs.delete(jobId);
  }

  /**
   * Enable a job
   */
  public enableJob(jobId: string): void {
      const job = this.jobs.get(jobId);
      if (job) {
          job.enabled = true;
          logger.info(`Enabled cron job: ${jobId}`);
      }
  }

  /**
   * Disable a job
   */
  public disableJob(jobId: string): void {
      const job = this.jobs.get(jobId);
      if (job) {
          job.enabled = false;
          logger.info(`Disabled cron job: ${jobId}`);
      }
  }

  /**
   * Get a job by ID
   */
  public getJob(jobId: string): CronJob | undefined {
      return this.jobs.get(jobId);
  }
  
  /**
   * Trigger the job (create a task)
   */
  public async triggerJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || !job.enabled) return;

    logger.info(`Triggering scheduled job: ${jobId}`);
    
    // Example: Create a task via TaskManager
    // const manager = await getTaskManager();
    // await manager.createTask(...)
  }

  public listJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }
}

export const getTaskScheduler = () => TaskScheduler.getInstance();
