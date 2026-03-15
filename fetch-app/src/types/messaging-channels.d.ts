/**
 * @fileoverview Type declarations for optional messaging channel dependencies.
 *
 * These SDKs are only required at runtime when their respective channels are
 * configured. The declarations allow TypeScript to compile without installing
 * the packages.
 */

declare module '@slack/bolt' {
  export class App {
    constructor(options: {
      token?: string;
      appToken?: string;
      socketMode?: boolean;
      signingSecret?: string;
    });
    start(): Promise<void>;
    stop(): Promise<void>;
    event(
      eventName: string,
      handler: (args: { event: unknown; say: unknown }) => Promise<void>,
    ): void;
    client: {
      chat: {
        postMessage(args: {
          channel: string;
          text: string;
          thread_ts?: string;
        }): Promise<{ ts?: string }>;
      };
      files: {
        uploadV2(args: {
          channel_id: string;
          content: string;
          filename: string;
          thread_ts?: string;
        }): Promise<void>;
      };
    };
  }
}

declare module 'telegraf' {
  export class Telegraf {
    constructor(token: string);
    start(): Promise<void>;
    stop(signal?: string): Promise<void>;
    on(event: string, handler: (ctx: unknown) => Promise<void>): void;
    command(cmd: string, handler: (ctx: unknown) => Promise<void>): void;
    telegram: {
      sendMessage(
        chatId: number | string,
        text: string,
        extra?: { parse_mode?: string; reply_to_message_id?: number },
      ): Promise<{ message_id: number }>;
      getMe(): Promise<{ id: number; username: string }>;
    };
    botInfo?: { id: number; username: string };
  }
}

declare module 'discord.js' {
  export class Client {
    constructor(options: { intents: number[] });
    login(token: string): Promise<string>;
    destroy(): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    once(event: string, handler: (...args: unknown[]) => void): void;
    user?: { id: string; username: string; tag: string };
    channels: {
      fetch(
        id: string,
      ): Promise<{ send: (content: string) => Promise<{ id: string }> } | null>;
    };
  }

  export const GatewayIntentBits: {
    Guilds: number;
    GuildMessages: number;
    MessageContent: number;
    DirectMessages: number;
  };
}
