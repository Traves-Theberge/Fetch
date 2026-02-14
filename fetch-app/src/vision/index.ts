/**
 * @fileoverview Image analysis helpers for inbound WhatsApp media.
 *
 * Calls OpenRouter vision models via the OpenAI-compatible SDK.
 *
 * @module vision/index
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

let openaiClient: OpenAI | null = null;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns a cached OpenAI client configured for OpenRouter vision requests. */
function getClient(): OpenAI {
  if (openaiClient) return openaiClient;

  // We strictly use OpenRouter for all AI services
  const apiKey = env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY for vision analysis');
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  return openaiClient;
}

/** Analyzes one image and returns the model text response. */
export async function analyzeImage(
  base64Data: string, 
  mimeType: string, 
  context: string = ''
): Promise<string> {
  try {
    validateImageInput(base64Data, mimeType);
    const client = getClient();
    
    logger.info(`🖼️ Analyzing image (${(base64Data.length / 1024 / 1.33).toFixed(1)} KB)...`);

    const systemPrompt = `
Analyze the provided image.
${context ? `User context: "${context}"` : ''}

Instructions:
1. CODE/ERRORS: usage of code, terminal output, or logs MUST be transcribed EXACTLY.
2. UI/DESIGN: Describe layout, components, and styling in technical terms (e.g. CSS/Tailwind).
3. GENERAL: Provide a detailed description of the content.
    `.trim();

    // Standard OpenAI Vision format
    const response = await client.chat.completions.create({
      model: env.VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const result = response.choices[0]?.message?.content?.trim() || 'No analysis available.';
    logger.debug('🖼️ Vision analysis complete');
    
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid image input:')) {
      throw error;
    }
    logger.error('Failed to analyze image', error);
    throw new Error('Image analysis failed. Please try again or describe the problem in text.');
  }
}

/** Returns `true` when vision requests can be made. */
export function isVisionAvailable(): boolean {
  return !!env.OPENROUTER_API_KEY;
}

function validateImageInput(base64Data: string, mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Invalid image input: unsupported mime type "${mimeType}"`);
  }

  const normalized = base64Data.replace(/\s+/g, '');
  if (normalized.length === 0) {
    throw new Error('Invalid image input: empty image payload');
  }

  const decodedBytes = estimateBase64SizeBytes(normalized);
  if (decodedBytes > MAX_IMAGE_BYTES) {
    throw new Error(`Invalid image input: payload too large (${decodedBytes} bytes, max ${MAX_IMAGE_BYTES})`);
  }
}

function estimateBase64SizeBytes(base64Data: string): number {
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}
