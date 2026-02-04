/**
 * @fileoverview Transcription service wrapper
 * 
 * Provides audio-to-text transcription using OpenAI Whisper.
 * Used for processing WhatsApp voice notes (PTT).
 * 
 * @module transcription/index
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

/**
 * Transcription service configuration
 */
export interface TranscriptionConfig {
  apiKey?: string;
  model?: string;
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

let openaiClient: OpenAI | null = null;

/**
 * Get or initialize the OpenAI client
 */
function getClient(): OpenAI {
  if (openaiClient) return openaiClient;

  // We strictly use OpenRouter for all AI services
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY for transcription');
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  return openaiClient;
}

/**
 * Transcribe audio data to text
 * 
 * @param audioBuffer - The audio data as a Buffer
 * @param fileName - Original filename (helps with mime-type detection)
 * @returns Transcribed text (cleaned and trimmed)
 */
export async function transcribeAudio(audioBuffer: Buffer, fileName: string = 'audio.ogg'): Promise<string> {
  try {
    const client = getClient();
    
    logger.info(`🎙️ Transcribing audio: ${fileName} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);

    // Create a virtual file for the OpenAI SDK
    const response = await client.audio.transcriptions.create({
      file: await OpenAI.toFile(audioBuffer, fileName),
      model: 'whisper-1',
    });

    const text = response.text.trim();
    logger.debug(`📝 Transcription complete: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    return text;
  } catch (error) {
    logger.error('Failed to transcribe audio', error);
    throw new Error('Transcription failed. Please try again or type your command.');
  }
}

/**
 * Check if the transcription service is available
 */
export function isTranscriptionAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
}
