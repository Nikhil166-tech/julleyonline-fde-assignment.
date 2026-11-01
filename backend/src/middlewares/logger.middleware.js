/**
 * Enterprise Structured HTTP & Application Logger
 * Provides high-visibility, color-coded logging for incoming requests, status codes, response times,
 * authenticated user context, and tenant isolation boundaries.
 */

// ANSI Color Tokens
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function formatStatus(status) {
  if (status >= 500) return `${COLORS.red}${COLORS.bold}${status}${COLORS.reset}`;
  if (status >= 400) return `${COLORS.yellow}${COLORS.bold}${status}${COLORS.reset}`;
  if (status >= 300) return `${COLORS.cyan}${status}${COLORS.reset}`;
  if (status >= 200) return `${COLORS.green}${COLORS.bold}${status}${COLORS.reset}`;
  return `${status}`;
}

function formatMethod(method) {
  const m = method.padEnd(6);
  switch (method) {
    case 'GET':
      return `${COLORS.cyan}${m}${COLORS.reset}`;
    case 'POST':
      return `${COLORS.green}${m}${COLORS.reset}`;
    case 'PATCH':
    case 'PUT':
      return `${COLORS.yellow}${m}${COLORS.reset}`;
    case 'DELETE':
      return `${COLORS.red}${m}${COLORS.reset}`;
    default:
      return `${COLORS.magenta}${m}${COLORS.reset}`;
  }
}

export const logger = {
  info: (msg, meta = '') => {
    if (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TEST_LOGS) return;
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${COLORS.gray}[${ts}]${COLORS.reset} ${COLORS.green}INFO${COLORS.reset}  ${msg} ${meta ? COLORS.dim + JSON.stringify(meta) + COLORS.reset : ''}`);
  },
  warn: (msg, meta = '') => {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.warn(`${COLORS.gray}[${ts}]${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset}  ${msg} ${meta ? COLORS.dim + JSON.stringify(meta) + COLORS.reset : ''}`);
  },
  error: (msg, err = null) => {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.error(`${COLORS.gray}[${ts}]${COLORS.reset} ${COLORS.red}ERROR${COLORS.reset} ${msg}`, err ? err.stack || err : '');
  },
  debug: (msg, meta = '') => {
    if (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TEST_LOGS)) return;
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${COLORS.gray}[${ts}]${COLORS.reset} ${COLORS.magenta}DEBUG${COLORS.reset} ${msg} ${meta ? COLORS.dim + JSON.stringify(meta) + COLORS.reset : ''}`);
  },
};

/**
 * Express Middleware to log all incoming HTTP requests and responses
 */
export function requestLogger(req, res, next) {
  // Silence noisy health checks or test suite runs unless explicitly requested
  if (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TEST_LOGS) {
    return next();
  }

  // Skip polling / static ping spam if desired
  if (req.url === '/api/health' && req.method === 'GET') {
    return next();
  }

  const startTime = process.hrtime();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Intercept response finish event
  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    const statusFormatted = formatStatus(res.statusCode);
    const methodFormatted = formatMethod(req.method);
    
    const userMeta = req.user ? `${COLORS.dim}[User: ${req.user.email || req.user.id.substring(0, 8)}]${COLORS.reset}` : '';
    const tenantMeta = req.tenantId ? `${COLORS.dim}[Tenant: ${req.tenantId.substring(0, 8)}]${COLORS.reset}` : '';

    console.log(
      `${COLORS.gray}[${timestamp}]${COLORS.reset} HTTP ${methodFormatted} ${req.originalUrl || req.url} -> ${statusFormatted} ${COLORS.dim}(${durationMs}ms)${COLORS.reset} ${userMeta} ${tenantMeta}`
    );
  });

  next();
}
