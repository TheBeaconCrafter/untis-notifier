import { describe, it, expect } from 'vitest';
import formatter from '../helpers/formatter.js';

const { formatDateIso, formatTimeUntis, formatDateUntis } = formatter;

describe('Formatter', () => {
  describe('formatTimeUntis', () => {
    it('should format 800 as 8:00', () => {
      expect(formatTimeUntis(800)).toBe('8:00');
    });

    it('should format 845 as 8:45', () => {
      expect(formatTimeUntis(845)).toBe('8:45');
    });

    it('should format 1330 as 13:30', () => {
      expect(formatTimeUntis(1330)).toBe('13:30');
    });

    it('should format 905 as 9:05', () => {
      expect(formatTimeUntis(905)).toBe('9:05');
    });

    it('should format 0 as 0:00', () => {
      expect(formatTimeUntis(0)).toBe('0:00');
    });
  });

  describe('formatDateUntis', () => {
    it('should format YYYYMMDD as DD.MM.YYYY', () => {
      expect(formatDateUntis('20241015')).toBe('15.10.2024');
    });

    it('should handle beginning of year', () => {
      expect(formatDateUntis('20240101')).toBe('01.01.2024');
    });

    it('should handle end of year', () => {
      expect(formatDateUntis('20241231')).toBe('31.12.2024');
    });
  });

  describe('formatDateIso', () => {
    it('should format a Date to ISO-like string', () => {
      const date = new Date('2024-10-15T14:30:00Z');
      const result = formatDateIso(date);
      // Should be in format YYYY-MM-DD HH:MM:SS
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});
