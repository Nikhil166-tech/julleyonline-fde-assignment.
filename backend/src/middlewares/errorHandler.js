import { AppError } from '../errors/AppError.js';
import { ZodError } from 'zod';
import { logger } from './logger.middleware.js';

export function errorHandler(err, req, res, next) {
  // If headers have already been sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Known Domain AppErrors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // Handle Prisma Known Request Errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      const target = err.meta?.target || 'unique field';
      return res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: `A record with this ${target} already exists`,
        },
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: err.meta?.cause || 'Record not found',
        },
      });
    }
  }

  // Uncaught / Internal Server Error
  logger.error(`[Unhandled Error] ${req.method} ${req.originalUrl || req.url}`, err);

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}
