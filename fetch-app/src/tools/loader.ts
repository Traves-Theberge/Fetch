/**
 * @fileoverview Custom tool definition loader and schema builder.
 *
 * Reads `data/tools/*.json` files and converts their parameter definitions
 * into runtime Zod validation schemas.
 *
 * @module tools/loader
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

const customToolParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean']),
  description: z.string().min(1),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
});

const customToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  danger: z.nativeEnum(DangerLevel).optional(),
  parameters: z.array(customToolParameterSchema).default([]),
}).strict();

/** Loads and validates a single custom tool definition file. */
export async function loadToolDefinition(filePath: string): Promise<CustomToolDefinition | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = customToolDefinitionSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(`Invalid tool definition in ${filePath}`, {
        issues: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
      return null;
    }

    return validated.data;
  } catch (error) {
    logger.error(`Failed to load tool from ${filePath}`, error);
    return null;
  }
}

/** Builds a Zod input schema from a custom tool parameter list. */
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
