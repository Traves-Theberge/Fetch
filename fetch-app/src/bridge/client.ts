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
import { getTaskIntegration } from '../task/integration.js';
import { updateStatus, incrementMessageCount } from '../api/status.js';
import { transcribeAudio, isTranscriptionAvailable } from '../transcription/index.js';
import { analyzeImage, isVisionAvailable } from '../vision/index.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TASK EVENT INTERFACES
// =============================================================================

/** Payload shape for task:progress events */
interface TaskProgressEvent {
  sessionId?: string;
  message?: string;
}

/** Payload shape for task:file_op events */
interface TaskFileOpEvent {
  sessionId?: string;
  operation?: string;
  path?: string;
}

/** Payload shape for task:question events */
interface TaskQuestionEvent {
  sessionId?: string;
  question?: string;
}

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
// MESSAGE DEDUPLICATION
// =============================================================================

/**
 * Tracks recently processed message IDs to prevent duplicate processing.
 * WhatsApp's message_create event can fire multiple times for the same message.
 * Uses a Map with timestamps for automatic TTL-based cleanup.
 */
class MessageDeduplicator {
  private processedMessages = new Map<string, number>();
  private readonly TTL_MS = 30000; // 30 seconds
  
  /**
   * Check if message was already processed. Returns true if new, false if duplicate.
   * Automatically cleans up old entries.
   */
  isNew(messageId: string): boolean {
    const now = Date.now();
    
    // Cleanup old entries
    for (const [id, timestamp] of this.processedMessages) {
      if (now - timestamp > this.TTL_MS) {
        this.processedMessages.delete(id);
      }
    }
    
    // Check if already processed
    if (this.processedMessages.has(messageId)) {
      return false;
    }
    
    // Mark as processed
    this.processedMessages.set(messageId, now);
    return true;
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
  private deduplicator = new MessageDeduplicator();

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

    // SecurityGate initialized in initialize() for async whitelist loading
    this.securityGate = null as unknown as SecurityGate;
    this.rateLimiter = new RateLimiter(30, 60000); // 30 requests per minute
  }

  async initialize(): Promise<void> {
    // Clean up any stale Chrome lock files from previous crashes
    cleanupChromeLocks('/app/data/.wwebjs_auth');
    
    // Initialize security gate with Zero Trust Bonding whitelist
    this.securityGate = await SecurityGate.create();
    
    // Initialize agentic handler
    await initializeHandler();
    
    this.setupEventHandlers();
    this.setupTaskProgressListeners();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatsapp-web.js has no typed Reaction export
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
      // DEDUPLICATION: WhatsApp fires message_create multiple times for same message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatsapp-web.js Message.id not in type defs
      const msgId = (message as any).id?._serialized || (message as any).id?.id || String(message.timestamp);
      if (!this.deduplicator.isNew(msgId)) {
        logger.debug(`Skipped duplicate message: ${msgId}`);
        return;
      }
      
      logger.debug(`message_create: from=${message.from}, type=${message.type}, fromMe=${message.fromMe}`);
      
      // Handle Voice Notes (PTT)
      if (message.type === 'ptt' || message.type === 'audio') {
        const success = await this.handleVoiceMessage(message);
        if (!success) {
          logger.debug('Skipped: voice transcription failed or not available');
          return;
        }
      }

      // Handle Images
      if (message.type === 'image') {
        await this.handleImageMessage(message);
        // Note: we don't return if it fails, as it might still have a text caption
      }

      // Skip empty messages (media without caption, etc.)
      if (!message.body || message.body.trim() === '') {
        logger.debug('Skipped: empty message body');
        return;
      }
      
      // Check if this is a reply to a Fetch message (thread continuation)
      const isReplyToFetch = await this.isReplyToFetchMessage(message);
      const hasFetchTrigger = message.body.toLowerCase().trim().startsWith('@fetch');
      
      // For messages from us (fromMe=true), process if @fetch OR reply to Fetch
      // This allows self-chat and also allows us to trigger Fetch on our own responses if needed
      if (message.fromMe) {
        if (!hasFetchTrigger && !isReplyToFetch) {
          // logger.debug('Skipped: fromMe without @fetch trigger or thread reply');
          return;
        }
        logger.info(`Processing self-chat message${isReplyToFetch ? ' (thread reply)' : ''}`);
      } else {
        // For messages from others, also require trigger OR reply
        if (!hasFetchTrigger && !isReplyToFetch) {
          return;
        }
        logger.info(`Processing incoming message from ${message.from}${isReplyToFetch ? ' (thread reply)' : ''}`);
      }
      
      incrementMessageCount();
      await this.handleIncomingMessage(message, isReplyToFetch);
    });
  }

  /**
   * Check if message is a reply to a Fetch bot message
   */
  private async isReplyToFetchMessage(message: Message): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatsapp-web.js getQuotedMessage not in type defs
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
   * Handle image messages by analyzing them with vision
   */
  private async handleImageMessage(message: Message): Promise<boolean> {
    if (!isVisionAvailable()) {
      logger.warn('Image received but vision is not configured (missing API key)');
      return false;
    }

    try {
      logger.info('🖼️ Processing image...');
      
      const media = await message.downloadMedia();
      if (!media || !media.data) {
        logger.error('Failed to download image media');
        return false;
      }

      // If it's not an image, skip
      if (!media.mimetype.startsWith('image/')) {
        return false;
      }

      const originalCaption = message.body || '';
      const analysis = await analyzeImage(media.data, media.mimetype, originalCaption);
      
      if (!analysis) return false;

      // Update message body to include analysis context
      message.body = `${originalCaption}\n\n[CONTEXT: Image Analysis]\n${analysis}`.trim();
      
      logger.success('🖼️ Image analysis added to message context');
      return true;
    } catch (error) {
      logger.error('Failed to handle image message', error);
      return false;
    }
  }

  /**
   * Listen for real-time task progress and route to WhatsApp
   */
  private setupTaskProgressListeners(): void {
    const integration = getTaskIntegration();

    // Mapping to track last progress message per session to avoid noise
    const lastProgressUpdate = new Map<string, number>();
    const THROTTLE_MS = 3000; // Minimum 3s between general progress updates

    integration.on('task:progress', async (event: TaskProgressEvent) => {
      const { sessionId, message } = event;
      if (!sessionId || !message) return;

      const now = Date.now();
      const lastUpdate = lastProgressUpdate.get(sessionId) || 0;

      // Always send priority patterns, throttle others
      const isPriority = /starting|done|complete|failed|error|waiting/i.test(message);
      
      if (isPriority || (now - lastUpdate > THROTTLE_MS)) {
        try {
          await this.client.sendMessage(sessionId, `🐕 ${message}`);
          lastProgressUpdate.set(sessionId, now);
        } catch (error) {
          logger.error('Failed to send progress message', error);
        }
      }
    });

    integration.on('task:file_op', async (event: TaskFileOpEvent) => {
      const { sessionId, operation, path } = event;
      if (!sessionId) return;

      try {
        const emoji = operation === 'create' ? '🆕' : operation === 'modify' ? '✏️' : '🗑️';
        const action = operation === 'modify' ? 'Modifying' : operation === 'create' ? 'Creating' : 'Deleting';
        
        await this.client.sendMessage(sessionId, `${emoji} ${action} ${path}...`);
      } catch (error) {
        logger.error('Failed to send file_op message', error);
      }
    });

    integration.on('task:question', async (event: TaskQuestionEvent) => {
      const { sessionId, question } = event;
      if (!sessionId || !question) return;

      try {
        await this.client.sendMessage(
          sessionId, 
          `❓ *Fetch needs your help:*\n\n${question}\n\n_(Reply to this message to answer)_`
        );
      } catch (error) {
        logger.error('Failed to send task question', error);
      }
    });
  }

  /**
   * Handle voice messages by transcribing them first
   */
  private async handleVoiceMessage(message: Message): Promise<boolean> {
    if (!isTranscriptionAvailable()) {
      logger.warn('Voice message received but transcription is not configured (missing API key)');
      return false;
    }

    try {
      logger.info('🎤 Processing voice note...');
      
      const media = await message.downloadMedia();

      const buffer = Buffer.from(media.data, 'base64');
      const filename = media.filename || `voice-${Date.now()}.ogg`;
      
      const result = await transcribeAudio(buffer, filename);
      const transcription = result.text;
      
      if (!transcription || transcription.trim().length === 0) {
        logger.warn('Transcription returned empty text');
        return false;
      }

      // Prepend a microphone emoji to indicate it was a voice note
      // and inject into the message body for normal processing
      message.body = transcription;
      
      logger.success(`🎤 Transcribed voice (${result.language || 'unknown'}): "${transcription}"`);
      return true;
    } catch (error) {
      logger.error('Failed to handle voice message', error);
      return false;
    }
  }

  /**
   * Handle incoming messages with strict security enforcement
   * SECURITY: Requires @fetch trigger + owner verification (unless thread reply)
   */
  private async handleIncomingMessage(message: Message, isThreadReply: boolean = false): Promise<void> {
    const senderId = message.from;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatsapp-web.js Message.author not in type defs
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
      let firstMessageSent = false;
      
      // Determine prefix for different media types
      let mediaPrefix = '';
      if (message.type === 'ptt' || message.type === 'audio') {
        mediaPrefix = `🎤 I heard: "${validation.sanitized}"\n\n`;
      } else if (message.type === 'image') {
        mediaPrefix = `🖼️ I see an image!\n\n`;
        // Optional: you could extract the summary from the analysis here if desired
      }

      // Process through agentic handler
      const responses = await handleMessage(
        rateLimitId, 
        validation.sanitized,
        async (text) => {
          let output = text;
          if (!firstMessageSent && mediaPrefix) {
            output = mediaPrefix + output;
            firstMessageSent = true;
          }
          await message.reply(output);
        }
      );
      
      // Send all response messages
      for (let i = 0; i < responses.length; i++) {
        let response = responses[i];
        
        // Prepend media info prefix if it was a voice note or image and we haven't sent the prefix yet
        if (!firstMessageSent && mediaPrefix) {
          response = mediaPrefix + response;
          firstMessageSent = true; // Mark as sent so subsequent responses don't get it
        }

        await message.reply(response);
        logger.success(`Reply sent (${response.length} chars)`);
        
        // Small delay between messages to avoid rate limiting
        if (responses.length > 1 && i < responses.length - 1) {
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
