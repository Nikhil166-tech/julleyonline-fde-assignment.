/**
 * Test Database Safety Guard
 * Dedicated side-effect-free utility module to validate PostgreSQL connection URLs
 * before allowing destructive test-database resets or migrations.
 */
export function validateTestDatabaseUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('CRITICAL SAFETY ABORT: DATABASE_URL is missing or invalid.');
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('CRITICAL SAFETY ABORT: Malformed DATABASE_URL: Invalid URL format.');
  }

  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  const FORBIDDEN_DATABASES = [
    'julleyonline_kanban',
    'postgres',
    'production',
    'prod',
    'development',
    'dev',
    'stage',
    'staging',
  ];

  if (
    FORBIDDEN_DATABASES.includes(dbName.toLowerCase()) ||
    dbName.toLowerCase() !== 'julleyonline_kanban_test'
  ) {
    throw new Error(
      `CRITICAL SAFETY ABORT: Refused execution against database "${dbName}". Strictly only "julleyonline_kanban_test" is authorized.`
    );
  }

  return dbName;
}
