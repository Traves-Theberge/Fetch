/**
 * WhatsApp Bridge Client
 * 
 * Handles WhatsApp connection with strict security whitelist enforcement.
 * SECURITY: All messages from non-whitelisted numbers are silently dropped.
 * 
 * Updated for agentic architecture - routes to handler module.
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
      
      // Console output - lots of padding to prevent cutoff
      console.log('\n\n\n\n\n'); // 5 lines padding above
      console.log('═'.repeat(50));
      logger.info('📱 Scan this QR code to authenticate:');
      console.log('═'.repeat(50));
      console.log(''); // Space before QR
      qrcode.generate(qr, { small: true });
      console.log(''); // Space after QR
      console.log('═'.repeat(50));
      logger.info(`Or open in browser:\n${qrUrl}`);
      console.log('═'.repeat(50));
      console.log('\n\n'); // Padding below
    });

    // Ready event
    this.client.on('ready', () => {
      updateStatus({ state: 'authenticated', qrCode: null, qrUrl: null });
      logger.info('🐕 Fetch is connected and ready!');
    });

    // Authentication success
    this.client.on('authenticated', () => {
      updateStatus({ state: 'authenticated', qrCode: null, qrUrl: null });
      logger.info('✅ WhatsApp authentication successful');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg: string) => {
      updateStatus({ state: 'error', lastError: msg });
      logger.error('❌ WhatsApp authentication failed:', msg);
    });

    // Disconnected
    this.client.on('disconnected', (reason: string) => {
      updateStatus({ state: 'disconnected', lastError: reason });
      logger.warn('📴 WhatsApp disconnected:', reason);
    });

    // Message handler with security gate
    this.client.on('message', async (message: Message) => {
      incrementMessageCount();
      await this.handleIncomingMessage(message);
    });
  }

  /**
   * Handle incoming messages with strict security enforcement
   * SECURITY: Non-whitelisted messages are silently dropped
   */
  private async handleIncomingMessage(message: Message): Promise<void> {
    const senderId = message.from;
    
    // SECURITY GATE 1: Validate sender against whitelist
    if (!this.securityGate.isAuthorized(senderId)) {
      // Silent drop - do not acknowledge unauthorized messages
      logger.debug(`Dropped message from unauthorized sender: ${senderId}`);
      return;
    }

    // SECURITY GATE 2: Rate limiting
    if (!this.rateLimiter.isAllowed(senderId)) {
      await message.reply('⏳ Slow down! You\'re sending too many requests. Please wait a moment.');
      return;
    }

    // SECURITY GATE 3: Input validation
    const validation = validateInput(message.body);
    if (!validation.valid) {
      logger.warn(`Invalid input from owner: ${validation.error}`);
      await message.reply(`❌ ${validation.error}`);
      return;
    }

    logger.info(`📨 Received message from owner: ${validation.sanitized.substring(0, 50)}...`);

    try {
      // Process through agentic handler
      const responses = await handleMessage(senderId, validation.sanitized);
      
      // Send all response messages
      for (const response of responses) {
        await message.reply(response);
        
        // Small delay between messages to avoid rate limiting
        if (responses.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      logger.error('Error processing message:', error);
      await message.reply('❌ Sorry, I encountered an error processing your request.');
    }
  }

  async destroy(): Promise<void> {
    await shutdown();
    await this.client.destroy();
  }
}
