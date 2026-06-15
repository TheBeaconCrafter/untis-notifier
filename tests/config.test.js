import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dotenv before importing config
vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test');
vi.stubEnv('DISCORD_PING_TARGET', 'role:999888777');
vi.stubEnv('UNTIS_SCHOOL_NAME', 'Test School');
vi.stubEnv('UNTIS_USERNAME', 'testuser');
vi.stubEnv('UNTIS_PASSWORD', 'testpass');
vi.stubEnv('UNTIS_URL', 'https://test.webuntis.com');
vi.stubEnv('ENABLE_WEB_SERVER', 'true');
vi.stubEnv('WEB_SERVER_PORT', '4000');
vi.stubEnv('CHECK_INTERVAL', '300000');
vi.stubEnv('ENABLE_ABSENCE_SCANNING', 'false');
vi.stubEnv('ENABLE_DEBUG', 'true');
vi.stubEnv('NODE_ENV', 'test');

describe('Config Module', () => {
  describe('parsePingTarget', () => {
    it('should parse user ping target', async () => {
      const { parsePingTarget } = await import('../config.js');
      const result = parsePingTarget('user:123456');
      expect(result).toEqual({
        type: 'user',
        id: '123456',
        mention: '<@123456>',
      });
    });

    it('should parse role ping target', async () => {
      const { parsePingTarget } = await import('../config.js');
      const result = parsePingTarget('role:789012');
      expect(result).toEqual({
        type: 'role',
        id: '789012',
        mention: '<@&789012>',
      });
    });

    it('should handle empty ping target', async () => {
      const { parsePingTarget } = await import('../config.js');
      const result = parsePingTarget('');
      expect(result).toEqual({
        type: 'none',
        id: null,
        mention: '',
      });
    });

    it('should handle null ping target', async () => {
      const { parsePingTarget } = await import('../config.js');
      const result = parsePingTarget(null);
      expect(result).toEqual({
        type: 'none',
        id: null,
        mention: '',
      });
    });

    it('should treat raw IDs as user IDs for backwards compatibility', async () => {
      const { parsePingTarget } = await import('../config.js');
      const result = parsePingTarget('123456789');
      expect(result).toEqual({
        type: 'user',
        id: '123456789',
        mention: '<@123456789>',
      });
    });
  });

  describe('envBool', () => {
    it('should parse "true" as true', async () => {
      const { envBool } = await import('../config.js');
      vi.stubEnv('TEST_BOOL', 'true');
      expect(envBool('TEST_BOOL', false)).toBe(true);
    });

    it('should parse "false" as false', async () => {
      const { envBool } = await import('../config.js');
      vi.stubEnv('TEST_BOOL', 'false');
      expect(envBool('TEST_BOOL', true)).toBe(false);
    });

    it('should parse "1" as true', async () => {
      const { envBool } = await import('../config.js');
      vi.stubEnv('TEST_BOOL', '1');
      expect(envBool('TEST_BOOL', false)).toBe(true);
    });

    it('should return fallback for empty string', async () => {
      const { envBool } = await import('../config.js');
      vi.stubEnv('TEST_BOOL', '');
      expect(envBool('TEST_BOOL', true)).toBe(true);
    });

    it('should return fallback for undefined', async () => {
      const { envBool } = await import('../config.js');
      delete process.env.TEST_UNDEFINED_BOOL;
      expect(envBool('TEST_UNDEFINED_BOOL', false)).toBe(false);
    });
  });

  describe('envInt', () => {
    it('should parse integer strings', async () => {
      const { envInt } = await import('../config.js');
      vi.stubEnv('TEST_INT', '42');
      expect(envInt('TEST_INT', 0)).toBe(42);
    });

    it('should return fallback for non-numeric strings', async () => {
      const { envInt } = await import('../config.js');
      vi.stubEnv('TEST_INT', 'notanumber');
      expect(envInt('TEST_INT', 99)).toBe(99);
    });

    it('should return fallback for empty string', async () => {
      const { envInt } = await import('../config.js');
      vi.stubEnv('TEST_INT', '');
      expect(envInt('TEST_INT', 100)).toBe(100);
    });
  });

  describe('config object', () => {
    it('should load discord config from env', async () => {
      const { default: config } = await import('../config.js');
      expect(config.discord.webhookUrl).toBe('https://discord.com/api/webhooks/test');
      expect(config.discord.pingTarget.type).toBe('role');
      expect(config.discord.pingTarget.id).toBe('999888777');
      expect(config.discord.pingTarget.mention).toBe('<@&999888777>');
    });

    it('should load untis config from env', async () => {
      const { default: config } = await import('../config.js');
      expect(config.untis.schoolName).toBe('Test School');
      expect(config.untis.username).toBe('testuser');
      expect(config.untis.password).toBe('testpass');
      expect(config.untis.url).toBe('test.webuntis.com');
    });

    it('should load server config from env', async () => {
      const { default: config } = await import('../config.js');
      expect(config.server.enabled).toBe(true);
      expect(config.server.port).toBe(4000);
    });

    it('should load scanning config from env', async () => {
      const { default: config } = await import('../config.js');
      expect(config.scanning.checkInterval).toBe(300000);
      expect(config.scanning.absences).toBe(false);
    });

    it('should be frozen (immutable)', async () => {
      const { default: config } = await import('../config.js');
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.discord)).toBe(true);
      expect(Object.isFrozen(config.untis)).toBe(true);
    });
  });
});
