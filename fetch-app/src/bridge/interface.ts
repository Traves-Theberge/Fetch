/**
 * @fileoverview Abstract bridge interface for multi-channel messaging support.
 *
 * Defines the contract that all messaging channel bridges (WhatsApp, Slack,
 * Telegram, Discord) must implement. Enables channel-agnostic message handling
 * throughout the application.
 *
 * @module bridge/interface
 */

// =============================================================================
// CHANNEL TYPES
// =============================================================================

/** Supported messaging channel identifiers. */
export type ChannelType = 'whatsapp' | 'slack' | 'telegram' | 'discord';

// =============================================================================
// INBOUND MESSAGE
// =============================================================================

/** Normalized inbound message from any channel. */
export interface InboundMessage {
  /** Unique message ID from the source platform. */
  id: string;
  /** Channel this message arrived on. */
  channel: ChannelType;
  /** Platform-specific sender identifier. */
  senderId: string;
  /** Text content of the message. */
  body: string;
  /** Whether this message was sent by the bot itself. */
  fromMe: boolean;
  /** For group contexts, the actual author's ID. */
  participantId?: string;
  /** Whether this is a reply to a previous bot message. */
  isReplyToBot?: boolean;
  /** Media type if applicable (voice, image, etc.). */
  mediaType?: 'voice' | 'image' | 'audio' | 'file';
  /** Base64-encoded media data, if present. */
  mediaData?: string;
  /** MIME type of attached media. */
  mediaMimetype?: string;
  /** Platform-specific metadata (thread ID, channel ID, etc.). */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// OUTBOUND MESSAGE
// =============================================================================

/** Outbound message destined for a specific channel. */
export interface OutboundMessage {
  /** Target user/channel identifier on the platform. */
  targetId: string;
  /** Text content to send. */
  text: string;
  /** Optional thread/reply context ID. */
  threadId?: string;
  /** Platform-specific send options. */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// BRIDGE INTERFACE
// =============================================================================

/**
 * Abstract bridge that all channel implementations must satisfy.
 *
 * Lifecycle: construct → initialize → (message flow) → destroy
 */
export interface MessageBridge {
  /** Which channel this bridge serves. */
  readonly channel: ChannelType;

  /** Initialize the bridge (connect, authenticate, bind listeners). */
  initialize(): Promise<void>;

  /** Gracefully shut down the bridge and release resources. */
  destroy(): Promise<void>;

  /** Send a text message to a target on this channel. */
  sendMessage(target: string, text: string, options?: OutboundMessage['metadata']): Promise<string | null>;

  /** Whether the bridge is connected and ready to send/receive. */
  isReady(): boolean;
}

// =============================================================================
// MESSAGE HANDLER CALLBACK
// =============================================================================

/**
 * Callback signature for processing normalized inbound messages.
 * Bridges call this after normalizing platform-specific events.
 */
export type MessageHandler = (message: InboundMessage) => Promise<string[]>;

// =============================================================================
// BRIDGE EVENTS
// =============================================================================

/** Events emitted by bridges for lifecycle tracking. */
export interface BridgeEvents {
  ready: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  messageSent: (messageId: string) => void;
}
