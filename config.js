import 'dotenv/config';

// Parse a boolean from an env string, defaulting to the provided fallback
function envBool(key, fallback = false) {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

// Parse an integer from an env string, defaulting to the provided fallback
function envInt(key, fallback) {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse the DISCORD_PING_TARGET env variable.
 * Supported formats:
 *   user:123456789   → mentions a specific user
 *   role:123456789   → mentions a role (group ping)
 *   (empty)          → no ping
 */
function parsePingTarget(raw) {
  if (!raw || raw.trim() === '') return { type: 'none', id: null, mention: '' };
  const trimmed = raw.trim();

  if (trimmed.startsWith('role:')) {
    const id = trimmed.slice(5);
    return { type: 'role', id, mention: `<@&${id}>` };
  }
  if (trimmed.startsWith('user:')) {
    const id = trimmed.slice(5);
    return { type: 'user', id, mention: `<@${id}>` };
  }
  // Fallback: treat as a raw user ID for backwards compatibility
  return { type: 'user', id: trimmed, mention: `<@${trimmed}>` };
}

const config = Object.freeze({
  discord: Object.freeze({
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    pingTarget: parsePingTarget(process.env.DISCORD_PING_TARGET),
  }),

  untis: Object.freeze({
    schoolName: process.env.UNTIS_SCHOOL_NAME || '',
    username: process.env.UNTIS_USERNAME || '',
    password: process.env.UNTIS_PASSWORD || '',
    url: (process.env.UNTIS_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  }),

  server: Object.freeze({
    enabled: envBool('ENABLE_WEB_SERVER', false),
    port: envInt('WEB_SERVER_PORT', 3000),
    disableRoutesExceptIcal: envBool('DISABLE_ROUTES_EXCEPT_ICAL', true),
  }),

  scanning: Object.freeze({
    checkInterval: envInt('CHECK_INTERVAL', 600000),
    absences: envBool('ENABLE_ABSENCE_SCANNING', true),
    homework: envBool('ENABLE_HOMEWORK_SCANNING', true),
    exams: envBool('ENABLE_EXAM_SCANNING', true),
    timetable: envBool('ENABLE_TIMETABLE_SCANNING', true),
  }),

  rangeStart: process.env.RANGE_START || '2024-09-09T00:00:00',
  enableIcalStreaming: envBool('ENABLE_ICAL_STREAMING', false),
  icalFileName: process.env.ICAL_FILE_NAME || 'timetable.ics',
  enableDebug: envBool('ENABLE_DEBUG', false),
  enableCorsForIcsViewer: envBool('ENABLE_CORS_FOR_ICS_VIEWER', false),
});

// Validate required fields at startup
const requiredFields = [
  ['DISCORD_WEBHOOK_URL', config.discord.webhookUrl],
  ['UNTIS_USERNAME', config.untis.username],
  ['UNTIS_PASSWORD', config.untis.password],
  ['UNTIS_URL', config.untis.url],
];

const missing = requiredFields.filter(([, val]) => !val).map(([key]) => key);
if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`[CONFIG] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[CONFIG] Please check your .env file. See .env.example for reference.');
  process.exit(1);
}

export default config;
export { parsePingTarget, envBool, envInt };
