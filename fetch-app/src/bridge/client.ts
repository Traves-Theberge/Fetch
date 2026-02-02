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
 * ## Security Model
 * 
 * - **Whitelist**: Only messages from WHITELIST_NUMBERS are processed
 * - **Rate Limit**: 30 requests per minute per user
 * - **Input Validation**: Messages are validated before processing
 * - **Silent Drop**: Unauthorized messages are dropped without response
 * 
 * ## Connection Flow
 * 
 * ```
 * initialize()
 *      ↓
 * QR Code Generated → Scan with WhatsApp
 *      ↓
 * Authenticated
 *      ↓
 * Ready (Listening)
 * ```
 * 
 * ## Message Flow
 * 
 * ```
 * Incoming Message
 *      ↓
 * Security Gate (whitelist check)
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
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';
import { SecurityGate, RateLimiter, validateInput } from '../security/index.js';
import { handleMessage, initializeHandler, shutdown } from '../handler/index.js';
import { updateStatus, incrementMessageCount } from '../api/status.js';

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
    // Initialize agentic handler
    await initializeHandler();
    
    this.setupEventHandlers();
    await this.client.initialize();
  }

  private setupEventHandlers(): void {
    // QR Code for authentication
    this.client.on('qr', (qr: string) => {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
      
      // Update status API
      updateStatus({
        state: 'qr_pending',
        qrCode: qr,
        qrUrl: qrUrl
      });
      
      // Console output with nice formatting
      logger.section('📱 WhatsApp Authentication Required');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
      logger.info('Scan the QR code above with WhatsApp');
      logger.info('Or open this URL in browser:');
      console.log(`   ${qrUrl.substring(0, 60)}...`);
      logger.divider();
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

    // Message handler with security gate
    // Use message_create to catch messages sent to yourself (self-chat)
    this.client.on('message_create', async (message: Message) => {
      // Skip messages sent by the bot itself (outgoing replies)
      if (message.fromMe && !message.to.endsWith('@c.us')) {
        return;
      }
      // For self-chat, fromMe is true but we still want to process @fetch triggers
      if (message.fromMe && !message.body.toLowerCase().trim().startsWith('@fetch')) {
        return;
      }
      incrementMessageCount();
      await this.handleIncomingMessage(message);
    });
  }

  /**
   * Handle incoming messages with strict security enforcement
   * SECURITY: Requires @fetch trigger + owner verification
   */
  private async handleIncomingMessage(message: Message): Promise<void> {
    const senderId = message.from;
    const participantId = (message as any).author; // Group message author
    const messageBody = message.body;
    
    // SECURITY GATE 1: Validate @fetch trigger + owner
    if (!this.securityGate.isAuthorized(senderId, participantId, messageBody)) {
      // Silent drop - do not acknowledge unauthorized messages
      return;
    }

    // Strip the @fetch trigger from the message
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
      const responses = await handleMessage(rateLimitId, validation.sanitized);
      
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
