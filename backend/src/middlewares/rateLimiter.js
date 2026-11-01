import rateLimit from 'express-rate-limit';

export function createAuthRateLimiter(options = {}) {
  // If in automated test environment, allow high threshold unless explicitly testing rate limiter
  const isTest = process.env.NODE_ENV === 'test';

  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || (isTest ? 1000 : 30), // Max 30 attempts per 15 mins in production/dev
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
      },
    },
    ...options,
  });
}

export const authRateLimiter = createAuthRateLimiter();
