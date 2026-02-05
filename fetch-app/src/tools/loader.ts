/**
 * @fileoverview Tool Loader
 * 
 * Loads custom shell-based tools from `data/tools/*.json` files.
 * This allows users to define new tools that execute scripts/commands.
 */

import fs from 'fs/promises';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { DangerLevel } from './types.js';

export interface CustomToolDefinition {
  name: string;
  description: string;
  command: string;     // Shell command to execute
  cwd?: string;        // Working directory (default: process.cwd())
  danger?: DangerLevel;
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required?: boolean;
    default?: unknown;
  }[];
}

/**
 * Load a single tool definition from a JSON file
 */
export async function loadToolDefinition(filePath: string): Promise<CustomToolDefinition | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Basic validation
    if (!data.name || !data.description || !data.command) {
        logger.warn(`Invalid tool definition in ${filePath}: missing core fields`);
        return null;
    }
    
    return data as CustomToolDefinition;
  } catch (error) {
    logger.error(`Failed to load tool from ${filePath}`, error);
    return null;
  }
}

/**
 * Convert a CustomToolDefinition into a Zod Validation Schema
 */
export function buildToolSchema(def: CustomToolDefinition): z.ZodSchema {
  const shape: Record<string, z.ZodTypeAny> = {};
  
  for (const param of def.parameters) {
    let validator: z.ZodTypeAny = z.any();

    switch (param.type) {
      case 'number': validator = z.number(); break;
      case 'boolean': validator = z.boolean(); break;
      case 'string': default: validator = z.string(); break;
    }
    
    if (param.description) validator = validator.describe(param.description);
    if (!param.required && param.default === undefined) validator = validator.optional();
    if (param.default !== undefined) validator = validator.default(param.default);
    
    shape[param.name] = validator;
  }
  
  return z.object(shape);
}
