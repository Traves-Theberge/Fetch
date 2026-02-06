/**
 * @fileoverview Conversation Summarizer
 * 
 * Automatically summarizes conversation history to maintain context
 * while keeping token usage efficient.
 */

import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { getSessionStore } from '../session/store.js';
import { Session, Message } from '../session/types.js';
import { logger } from '../utils/logger.js';

// Configuration
const SUMMARY_THRESHOLD = 20; // Summarize every N messages
import { env } from '../config/env.js';

const SUMMARY_MODEL = env.SUMMARY_MODEL;

export class ConversationSummarizer {
  private static instance: ConversationSummarizer | undefined;
  private openai: OpenAI;
  private store = getSessionStore();

  private constructor() {
    this.openai = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }

  public static getInstance(): ConversationSummarizer {
    if (!ConversationSummarizer.instance) {
      ConversationSummarizer.instance = new ConversationSummarizer();
    }
    return ConversationSummarizer.instance as ConversationSummarizer;
  }

  /**
   * Check if session needs summarization and run it if so.
   * This should be called after adding a message.
   */
  public async checkAndSummarize(session: Session): Promise<void> {
    const messages = session.messages;
    if (messages.length < SUMMARY_THRESHOLD) return;

    // Find the last summary point
    const summaries = this.store.getSummaries(session.id, 1);
    
    let startIndex = 0;
    
    // If we have a previous summary, find where it ended
    if (summaries.length > 0) {
      const lastSummary = summaries[0];
      const lastMsgIndex = messages.findIndex(m => m.id === lastSummary.range_end_id);
      if (lastMsgIndex >= 0) {
        startIndex = lastMsgIndex + 1;
      }
    }

    // Check if we have enough new messages since last summary
    const newMessages = messages.slice(startIndex);
    if (newMessages.length >= SUMMARY_THRESHOLD) {
      logger.info(`Triggering summarization for session ${session.id} (${newMessages.length} new messages)`);
      try {
        await this.generateSummary(session, newMessages);
      } catch (e) {
        logger.error('Summarization failed', e);
      }
    }
  }

  /**
   * Generate summary for a batch of messages
   */
  private async generateSummary(session: Session, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;

    const startId = messages[0].id;
    const endId = messages[messages.length - 1].id;
    const threadId = session.metadata?.activeThreadId || null;

    // Format transcript
    const transcript = messages.map(m => {
        const role = m.role.toUpperCase();
        let content = m.content;
        if (m.toolCalls) {
            content += `\n[Tool Calls: ${m.toolCalls.map(t => t.name).join(', ')}]`;
        }
        if (m.role === 'tool') {
            content = `[Tool Result]`; // Truncate tool output for summary
        }
        return `${role}: ${content}`;
    }).join('\n\n');

    const prompt = `
    Summarize the following conversation segment concisely. 
    Focus on:
    - Key decisions made
    - Technical details (file paths, libraries)
    - Pending tasks or issues
    
    Transcript:
    ${transcript}
    `;

    const response = await this.openai.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: "You are a technical aide summarizing a developer's session." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500
    });

    const content = response.choices[0].message.content || "No summary generated.";

    this.store.saveSummary({
        id: nanoid(),
        session_id: session.id,
        thread_id: threadId,
        range_start_id: startId,
        range_end_id: endId,
        content: content,
        created_at: new Date().toISOString()
    });

    logger.success(`Generated summary for session ${session.id}`);
  }
}

export const summarizer = ConversationSummarizer.getInstance();
