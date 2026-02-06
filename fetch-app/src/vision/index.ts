/**
 * @fileoverview Vision service wrapper
 * 
 * Provides image analysis using OpenAI/OpenRouter Vision models.
 * Used for processing WhatsApp images (screenshots, UI, whiteboard, etc.)
 * 
 * @module vision/index
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

let openaiClient: OpenAI | null = null;

/**
 * Get or initialize the OpenAI client for vision
 */
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

/**
 * Analyze an image using a vision model
 * 
 * @param base64Data - Image data in base64 format (no data: URI prefix)
 * @param mimeType - Image MIME type (e.g., image/jpeg)
 * @param context - User provided context (caption or message)
 * @returns Text description or analysis of the image
 */
export async function analyzeImage(
  base64Data: string, 
  mimeType: string, 
  context: string = ''
): Promise<string> {
  try {
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
    logger.error('Failed to analyze image', error);
    throw new Error('Image analysis failed. Please try again or describe the problem in text.');
  }
}

/**
 * Check if the vision service is available
 */
export function isVisionAvailable(): boolean {
  return !!env.OPENROUTER_API_KEY;
}
