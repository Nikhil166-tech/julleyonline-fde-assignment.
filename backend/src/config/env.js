import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '../../.env');
const testEnvPath = path.resolve(__dirname, '../../.env.test');

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: testEnvPath });
}
dotenv.config({ path: backendEnvPath });
// Fallback to default cwd .env if needed
dotenv.config();

export const envSchema = z.object({
  PORT: z
    .string()
    .default('5000')
    .refine((val) => {
      const port = Number(val);
      return Number.isInteger(port) && port > 0 && port <= 65535;
    }, {
      message: 'PORT must be an integer between 1 and 65535',
    })
    .transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AI_ASSISTANT_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  AI_SERVICE_URL: z.string().url().optional().default('http://127.0.0.1:8000'),
  AI_SERVICE_TOKEN: z.string().optional().default('dev-ai-service-token-secret'),
  AI_REQUEST_TIMEOUT_MS: z
    .string()
    .optional()
    .default('15000')
    .transform((val) => parseInt(val, 10) || 15000),
});

export function validateConfig(customEnv = process.env) {
  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Configuration Validation Error:\n${formattedErrors}`);
  }

  const data = result.data;
  return {
    ...data,
    // Provide convenient camelCase accessors
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    databaseUrl: data.DATABASE_URL,
    jwtSecret: data.JWT_SECRET,
    corsOrigin: data.CORS_ORIGIN,
    aiAssistantEnabled: data.AI_ASSISTANT_ENABLED,
    aiServiceUrl: data.AI_SERVICE_URL,
    aiServiceToken: data.AI_SERVICE_TOKEN,
    aiRequestTimeoutMs: data.AI_REQUEST_TIMEOUT_MS,
  };
}

export const config = validateConfig();
