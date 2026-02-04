/**
 * @fileoverview WhatsApp Bridge Client
 * 
 * Handles WhatsApp Web connection, authentication, and message routing.
 * Enforces strict security via whitelist and rate limiting.
 * 
 * @module bridge/client
 * @see {@link Bridge} - Main bridge class
 * @see {@link SecurityGate} - Number whitelist enforcement
 * @see {@link RateLimiter} - Rate limiting
 * 
 * ## Supported Interactions
 * 
 * | Type | Trigger | Notes |
 * |------|---------|-------|
 * | Direct message | `@fetch ...` | Standard command |
 * | Self-chat | `@fetch ...` | Message yourself |
 * | Thread reply | Reply to Fetch msg | No @fetch needed |
 * | Emoji reaction | 👍/👎 on Fetch msg | Approve/reject (WIP) |
 * 
 * ## Security Model
 * 
 * - **Whitelist**: Only messages from OWNER_PHONE_NUMBER are processed
 * - **Rate Limit**: 30 requests per minute per user
 * - **Input Validation**: Messages are validated before processing
 * - **Silent Drop**: Unauthorized messages are dropped without response
 * 
 * ## Message Flow
 * 
 * ```
 * Incoming Message/Reaction
 *      ↓
 * Empty body check
 *      ↓
 * Thread reply check (skip @fetch if replying to Fetch)
 *      ↓
 * @fetch trigger check
 *      ↓
 * Security Gate (owner verification)
 *      ↓
 * Rate Limiter
 *      ↓
 * Input Validation
 *      ↓
 * Handler (agent processing)
 *      ↓
 * Reply sent
 * ```
 * 
 * ## Self-Chat Support
 * 
 * WhatsApp routes self-chat messages with `to` field ending in `@lid`
 * instead of `@c.us`. This module handles this by using `message_create`
 * event and checking for `fromMe=true` with `@fetch` prefix.
 * 
 * @example
 * ```typescript
 * import { Bridge } from './client.js';
 * 
 * const bridge = new Bridge();
 * await bridge.initialize();
 * // QR code displayed, scan to connect
 * ```
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
type Message = pkg.Message;
type ClientType = InstanceType<typeof Client>;
import { logger } from '../utils/logger.js';
import { SecurityGate, RateLimiter, validateInput } from '../security/index.js';
import { handleMessage, initializeHandler, shutdown } from '../handler/index.js';
import { updateStatus, incrementMessageCount } from '../api/status.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// CHROME LOCK CLEANUP
// =============================================================================

/**
 * Removes stale Chrome lock files that prevent browser startup.
 * This happens when the container crashes without graceful shutdown.
 * 
 * @param authPath - Path to the .wwebjs_auth directory
 */
function cleanupChromeLocks(authPath: string): void {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  
  try {
    if (!fs.existsSync(authPath)) {
      return; // No auth directory yet, nothing to clean
    }
    
    // Find session directories (session-* folders)
    const entries = fs.readdirSync(authPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session')) {
        const sessionPath = path.join(authPath, entry.name);
        
        // Check for Default profile folder
        const defaultPath = path.join(sessionPath, 'Default');
        if (fs.existsSync(defaultPath)) {
          for (const lockFile of lockFiles) {
            const lockPath = path.join(defaultPath, lockFile);
            if (fs.existsSync(lockPath)) {
              fs.unlinkSync(lockPath);
              logger.info(`🧹 Cleaned up stale lock: ${lockFile}`);
            }
          }
        }
        
        // Also check session root for lock files
        for (const lockFile of lockFiles) {
          const lockPath = path.join(sessionPath, lockFile);
          if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
            logger.info(`🧹 Cleaned up stale lock: ${lockFile}`);
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`Could not clean Chrome locks: ${error}`);
  }
}

// =============================================================================
// BRIDGE CLASS
// =============================================================================

/**
 * WhatsApp Web bridge client.
 * 
 * Manages the WhatsApp Web connection using Puppeteer, handles
 * authentication via QR code, and routes messages through security
 * checks to the agent handler.
 * 
 * @class
 */
export class Bridge {
  private client: ClientType;
  private securityGate: SecurityGate;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '/app/data/.wwebjs_auth'
      }),
      // QR code settings - refresh every 20 seconds (default is 45)
      qrMaxRetries: 10,
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.securityGate = new SecurityGate();
    this.rateLimiter = new RateLimiter(30, 60000); // 30 requests per minute
  }

  async initialize(): Promise<void> {
    // Clean up any stale Chrome lock files from previous crashes
    cleanupChromeLocks('/app/data/.wwebjs_auth');
    
    // Initialize agentic handler
    await initializeHandler();
    
    this.setupEventHandlers();
    await this.client.initialize();
  }

  private setupEventHandlers(): void {
    // QR Code for authentication
    this.client.on('qr', (qr: string) => {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      
      // Update status API
      updateStatus({
        state: 'qr_pending',
        qrCode: qr,
        qrUrl: qrUrl
      });
      
      // Console output - show URL only (QR too large for terminal)
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║  📱 WhatsApp Authentication Required              ║');
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
      console.log('  Open this URL to see QR code:');
      console.log(`  ${qrUrl}`);
      console.log('');
      console.log('  📲 WhatsApp → Settings → Linked Devices → Link');
      console.log('');
    });

    // Ready event
    this.client.on('ready', () => {
      updateStatus({ state: 'authenticated', qrCode: null, qrUrl: null });
      logger.section('🐕 Fetch is Ready!');
      logger.success('WhatsApp connected and listening for commands');
      logger.info('Send a message starting with @fetch to interact');
      logger.divider();
    });

    // Authentication success
    this.client.on('authenticated', () => {
      updateStatus({ state: 'authenticated', qrCode: null, qrUrl: null });
      logger.success('WhatsApp authentication successful');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg: string) => {
      updateStatus({ state: 'error', lastError: msg });
      logger.error('WhatsApp authentication failed', msg);
    });

    // Disconnected
    this.client.on('disconnected', (reason: string) => {
      updateStatus({ state: 'disconnected', lastError: reason });
      logger.warn('WhatsApp disconnected', reason);
    });

    // ==========================================================================
    // MESSAGE REACTION HANDLER
    // Emoji reactions like 👍, ❤️, etc. on messages
    // ==========================================================================
    this.client.on('message_reaction', async (reaction: any) => {
      try {
        // Only process reactions from owner
        const senderId = reaction.senderId;
        if (!senderId || !this.securityGate.isOwnerMessage(senderId, undefined)) {
          logger.debug(`Skipped reaction from non-owner: ${senderId}`);
          return;
        }

        // Only process reactions on our messages (fromMe)
        const msgId = reaction.msgId;
        if (!msgId) {
          logger.debug('Reaction missing msgId');
          return;
        }

        const emoji = reaction.reaction;
        logger.info(`Reaction received: ${emoji} on message ${msgId._serialized || msgId}`);

        // Map reactions to actions
        // 👍 = approve/continue, 👎 = cancel/reject, ❌ = cancel
        const approveEmojis = ['👍', '✅', '👌', '🙌', '💯'];
        const rejectEmojis = ['👎', '❌', '🚫', '⛔'];
        const cancelEmojis = ['🛑', '⏹️', '❌'];

        if (approveEmojis.includes(emoji)) {
          logger.info('Processing approval via reaction');
          // TODO: Handle approval - send "yes" to handler
          // await handleMessage(senderId, 'yes');
        } else if (rejectEmojis.includes(emoji) || cancelEmojis.includes(emoji)) {
          logger.info('Processing rejection/cancel via reaction');
          // TODO: Handle rejection - send "no" to handler
          // await handleMessage(senderId, 'no');
        }
        // Other emojis are ignored (just acknowledgements)
      } catch (error) {
        logger.error('Failed to process reaction', error);
      }
    });

    // ==========================================================================
    // MESSAGE HANDLERS
    // ==========================================================================
    
    // Use message_create to catch ALL messages including self-chat
    this.client.on('message_create', async (message: Message) => {
      logger.debug(`message_create: from=${message.from}, to=${message.to}, fromMe=${message.fromMe}, body="${message.body.substring(0, 50)}"`);
      
      // Skip empty messages (media without caption, etc.)
      if (!message.body || message.body.trim() === '') {
        logger.debug('Skipped: empty message body');
        return;
      }
      
      // Check if this is a reply to a Fetch message (thread continuation)
      const isReplyToFetch = await this.isReplyToFetchMessage(message);
      const hasFetchTrigger = message.body.toLowerCase().trim().startsWith('@fetch');
      
      // For self-chat messages (fromMe=true), process if @fetch OR reply to Fetch
      if (message.fromMe) {
        if (!hasFetchTrigger && !isReplyToFetch) {
          logger.debug('Skipped: fromMe without @fetch trigger or thread reply');
          return;
        }
        logger.info(`Processing self-chat message${isReplyToFetch ? ' (thread reply)' : ''}`);
      }
      
      incrementMessageCount();
      await this.handleIncomingMessage(message, isReplyToFetch);
    });

    // Also listen to regular message event for incoming messages from others
    this.client.on('message', async (message: Message) => {
      logger.debug(`message: from=${message.from}, body="${message.body.substring(0, 50)}"`);
      
      // Skip empty messages
      if (!message.body || message.body.trim() === '') {
        return;
      }
      
      // Check if this is a reply to a Fetch message (thread continuation)
      const isReplyToFetch = await this.isReplyToFetchMessage(message);
      const hasFetchTrigger = message.body.toLowerCase().trim().startsWith('@fetch');
      
      // Only process if starts with @fetch OR is reply to Fetch
      if (!hasFetchTrigger && !isReplyToFetch) {
        return;
      }
      logger.info(`Incoming message from ${message.from}${isReplyToFetch ? ' (thread reply)' : ''}`);
      incrementMessageCount();
      await this.handleIncomingMessage(message, isReplyToFetch);
    });
  }

  /**
   * Check if message is a reply to a Fetch bot message
   */
  private async isReplyToFetchMessage(message: Message): Promise<boolean> {
    try {
      const quotedMsg = await (message as any).getQuotedMessage();
      if (!quotedMsg) return false;
      
      // Check if the quoted message is from us (fromMe)
      if (quotedMsg.fromMe) {
        logger.debug('Message is reply to Fetch response');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming messages with strict security enforcement
   * SECURITY: Requires @fetch trigger + owner verification (unless thread reply)
   */
  private async handleIncomingMessage(message: Message, isThreadReply: boolean = false): Promise<void> {
    const senderId = message.from;
    const participantId = (message as any).author; // Group message author
    const messageBody = message.body;
    
    // SECURITY GATE 1: Validate authorization
    // For thread replies, we skip the @fetch trigger check but still verify owner
    if (isThreadReply) {
      // For thread replies, just verify owner (no @fetch required)
      if (!this.securityGate.isOwnerMessage(senderId, participantId)) {
        return;
      }
    } else {
      // Normal flow: require @fetch trigger + owner
      if (!this.securityGate.isAuthorized(senderId, participantId, messageBody)) {
        return;
      }
    }

    // Strip the @fetch trigger from the message (if present)
    const command = this.securityGate.stripTrigger(messageBody);

    // SECURITY GATE 2: Rate limiting
    const rateLimitId = participantId || senderId;
    if (!this.rateLimiter.isAllowed(rateLimitId)) {
      await message.reply('⏳ Slow down! You\'re sending too many requests. Please wait a moment.');
      return;
    }

    // SECURITY GATE 3: Input validation
    const validation = validateInput(command);
    if (!validation.valid) {
      logger.warn(`Invalid input from owner: ${validation.error}`);
      await message.reply(`❌ ${validation.error}`);
      return;
    }

    logger.message(`Received: "${validation.sanitized.substring(0, 40)}${validation.sanitized.length > 40 ? '...' : ''}"`);

    try {
      // Process through agentic handler
      const responses = await handleMessage(
        rateLimitId, 
        validation.sanitized,
        async (text) => {
          await message.reply(text);
        }
      );
      
      // Send all response messages
      for (const response of responses) {
        await message.reply(response);
        logger.success(`Reply sent (${response.length} chars)`);
        
        // Small delay between messages to avoid rate limiting
        if (responses.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      logger.error('Failed to process message', error);
      await message.reply('❌ Sorry, I encountered an error processing your request.');
    }
  }

  async destroy(): Promise<void> {
    await shutdown();
    await this.client.destroy();
  }
}
