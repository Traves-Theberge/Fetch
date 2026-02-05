/**
 * @fileoverview Local Transcription Service
 * 
 * Provides audio-to-text transcription using local whisper.cpp.
 * 100% free, no API costs - runs entirely in the Docker container.
 * Used for processing WhatsApp voice notes (PTT).
 * 
 * @module transcription/index
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/** Path to the whisper model */
const WHISPER_MODEL = process.env.WHISPER_MODEL || '/app/models/ggml-tiny.bin';

/** Path to whisper-cpp binary */
const WHISPER_BIN = '/usr/local/bin/whisper-cpp';

/** Temp directory for audio files */
const TEMP_DIR = '/tmp';

/**
 * Transcription result
 */
export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

/**
 * Convert audio buffer to WAV format using ffmpeg
 * whisper.cpp requires 16kHz mono WAV
 */
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  const cmd = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" -y 2>/dev/null`;
  await execAsync(cmd);
}

/**
 * Transcribe audio data to text using local whisper.cpp
 * 
 * @param audioBuffer - The audio data as a Buffer
 * @param fileName - Original filename (helps with mime-type detection)
 * @returns Transcribed text (cleaned and trimmed)
 */
export async function transcribeAudio(audioBuffer: Buffer, fileName: string = 'audio.ogg'): Promise<TranscriptionResult> {
  const id = randomUUID().slice(0, 8);
  const inputPath = join(TEMP_DIR, `voice-${id}.ogg`);
  const wavPath = join(TEMP_DIR, `voice-${id}.wav`);
  const outputPath = join(TEMP_DIR, `voice-${id}`);
  
  try {
    logger.info(`🎙️ Transcribing audio locally: ${fileName} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);

    // Write audio buffer to temp file
    await writeFile(inputPath, audioBuffer);
    
    // Convert to 16kHz mono WAV (required by whisper.cpp)
    await convertToWav(inputPath, wavPath);
    
    // Run whisper.cpp transcription
    // -nt = no timestamps, -np = no progress, -ml 1 = single segment
    // We capture stderr to detect language
    const cmd = `${WHISPER_BIN} -m ${WHISPER_MODEL} -f "${wavPath}" -nt -np --output-txt -of "${outputPath}"`;
    
    const { stderr } = await execAsync(cmd, { timeout: 60000 }); // 60s timeout
    
    // Read the output text file
    const text = (await readFile(`${outputPath}.txt`, 'utf-8')).trim();
    
    // Try to detect language from stderr logs
    // Example: "detect: detected language 'en'"
    const langMatch = stderr.match(/detected language:?\s+['"]?(\w+)['"]?/i);
    const language = langMatch ? langMatch[1] : undefined;
    
    logger.debug(`📝 Transcription complete (${language || 'unknown'}): "${text.substring(0, 50)}..."`);
    
    return { text, language };
  } catch (error) {
    logger.error('Failed to transcribe audio locally', error);
    // Simple retry logic could go here, but for local exec, usually fatal.
    throw new Error('Transcription failed. Please try again.');
  } finally {
    // Cleanup temp files
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(wavPath).catch(() => {}),
      unlink(`${outputPath}.txt`).catch(() => {}),
    ]);
  }
}

/**
 * Check if the transcription service is available
 * Local whisper.cpp is always available in the container
 */
export function isTranscriptionAvailable(): boolean {
  return true; // Local whisper.cpp is always available
}
