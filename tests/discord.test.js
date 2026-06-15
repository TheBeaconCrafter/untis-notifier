import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before imports
vi.mock('../config.js', () => ({
  default: {
    discord: {
      webhookUrl: 'https://discord.com/api/webhooks/test/token',
      pingTarget: { type: 'role', id: '999888777', mention: '<@&999888777>' },
    },
    untis: {
      schoolName: 'Test School',
      username: 'testuser',
      password: 'testpass',
      url: 'https://test.webuntis.com',
    },
    enableDebug: false,
  },
}));

import discord from '../helpers/discord.js';

describe('Discord Module', () => {
  describe('buildAbsenceEmbed', () => {
    const testAbsence = {
      studentName: 'John Doe',
      reason: 'Sick',
      date: '2024-10-15',
      isExcused: 'Excused',
      startTime: '8:00',
      endTime: '12:00',
      createdUser: 'Admin',
    };

    it('should build a new absence embed', () => {
      const embed = discord.buildAbsenceEmbed(testAbsence, 'new');
      expect(embed.title).toBe('⚠️ New Absence');
      expect(embed.color).toBe(0xffa500);
      expect(embed.fields).toHaveLength(6);
      expect(embed.fields[0].value).toBe('John Doe');
    });

    it('should build a removed absence embed', () => {
      const embed = discord.buildAbsenceEmbed(testAbsence, 'removed');
      expect(embed.title).toBe('✅ Absence Removed');
      expect(embed.color).toBe(0x2ecc71);
    });

    it('should build a modified absence embed', () => {
      const embed = discord.buildAbsenceEmbed(testAbsence, 'modified');
      expect(embed.title).toBe('⏪ Absence Modified');
      expect(embed.color).toBe(0x3498db);
    });

    it('should handle missing fields gracefully', () => {
      const minimal = { studentName: '', reason: '', date: '', isExcused: '', startTime: '', endTime: '', createdUser: '' };
      const embed = discord.buildAbsenceEmbed(minimal, 'new');
      expect(embed).toBeDefined();
      expect(embed.fields).toHaveLength(6);
    });
  });

  describe('buildTimetableEmbed', () => {
    it('should build embed for new lesson', () => {
      const change = {
        type: 'new',
        date: 20241015,
        startTime: 800,
        endTime: 845,
        lesson: {
          su: [{ longname: 'Mathematics' }],
          ro: [{ name: 'A101', longname: 'Room 101' }],
          te: [{ longname: 'Mr. Smith' }],
        },
      };

      const embed = discord.buildTimetableEmbed(change);
      expect(embed.title).toBe('🆕 New Lesson');
      expect(embed.color).toBe(0x2ecc71);
      expect(embed.fields.find(f => f.name === 'Subject').value).toBe('Mathematics');
      expect(embed.fields.find(f => f.name === 'Date').value).toBe('2024-10-15');
    });

    it('should build embed for modified lesson', () => {
      const change = {
        type: 'modified',
        date: 20241015,
        startTime: 800,
        endTime: 845,
        oldLesson: {
          su: [{ longname: 'Math' }],
          ro: [{ name: 'A101' }],
          te: [{ longname: 'Smith' }],
        },
        newLesson: {
          su: [{ longname: 'Math' }],
          ro: [{ name: 'B202' }],
          te: [{ longname: 'Smith' }],
        },
        details: ['Room changed from A101 to B202'],
      };

      const embed = discord.buildTimetableEmbed(change);
      expect(embed.title).toBe('🔄 Lesson Updated');
      expect(embed.color).toBe(0xf39c12);
      expect(embed.fields.find(f => f.name === 'Changes').value).toContain('Room changed');
    });

    it('should build embed for removed lesson', () => {
      const change = {
        type: 'removed',
        date: 20241015,
        startTime: 800,
        endTime: 845,
        lesson: {
          su: [{ longname: 'English' }],
          ro: [{ name: 'C303' }],
          te: [{ longname: 'Jones' }],
        },
      };

      const embed = discord.buildTimetableEmbed(change);
      expect(embed.title).toBe('❌ Lesson Removed');
      expect(embed.color).toBe(0xe74c3c);
    });

    it('should handle missing date gracefully', () => {
      const change = {
        type: 'new',
        startTime: 800,
        endTime: 845,
        lesson: { su: [], ro: [], te: [] },
      };

      const embed = discord.buildTimetableEmbed(change);
      expect(embed).toBeDefined();
      expect(embed.fields.find(f => f.name === 'Subject').value).toBe('Unknown subject');
    });
  });

  describe('buildHomeworkEmbed', () => {
    it('should build homework embed', () => {
      const hw = {
        lessonId: 42,
        text: 'Read chapter 5',
        remark: 'Quiz on Friday',
        dueDate: new Date('2024-10-20'),
      };

      const embed = discord.buildHomeworkEmbed(hw);
      expect(embed.title).toBe('📃 New Homework');
      expect(embed.color).toBe(0x9b59b6);
      expect(embed.fields.find(f => f.name === 'Description').value).toBe('Read chapter 5');
      expect(embed.fields.find(f => f.name === 'Remark').value).toBe('Quiz on Friday');
    });

    it('should omit remark field when empty', () => {
      const hw = { lessonId: 1, text: 'Do exercise', remark: '', dueDate: new Date() };
      const embed = discord.buildHomeworkEmbed(hw);
      expect(embed.fields.find(f => f.name === 'Remark')).toBeUndefined();
    });
  });

  describe('buildExamEmbed', () => {
    it('should build exam embed', () => {
      const exam = {
        id: 201,
        name: 'Math Final',
        subject: 'Mathematics',
        examDate: 20241120,
        startTime: 800,
        endTime: 930,
        rooms: ['A101'],
        teachers: ['Mr. Smith'],
      };

      const embed = discord.buildExamEmbed(exam);
      expect(embed.title).toBe('📚 New Exam');
      expect(embed.color).toBe(0xe74c3c);
      expect(embed.fields.find(f => f.name === 'Name').value).toBe('Math Final');
      expect(embed.fields.find(f => f.name === 'Time').value).toBe('8:00 – 9:30');
    });
  });

  describe('buildSummaryLine', () => {
    it('should build summary for mixed changes', () => {
      const changes = [
        { _category: 'timetable' },
        { _category: 'timetable' },
        { _category: 'homework' },
        { _category: 'exam' },
      ];

      const summary = discord.buildSummaryLine(changes);
      expect(summary).toContain('4 changes detected');
      expect(summary).toContain('2 timetable changes');
      expect(summary).toContain('1 homework assignment');
      expect(summary).toContain('1 new exam');
    });

    it('should handle single change', () => {
      const changes = [{ _category: 'absence' }];
      const summary = discord.buildSummaryLine(changes);
      expect(summary).toContain('1 change detected');
      expect(summary).toContain('1 absence');
    });
  });

  describe('getPingMention', () => {
    it('should return the configured ping mention', () => {
      const mention = discord.getPingMention();
      expect(mention).toBe('<@&999888777>');
    });
  });

  describe('Tag functions', () => {
    it('tagAbsenceChanges should produce tagged items', () => {
      const absences = [
        { studentName: 'Test', reason: 'Sick', date: '2024-01-01', isExcused: 'No', startTime: '8:00', endTime: '9:00', createdUser: 'Admin' },
      ];
      const tagged = discord.tagAbsenceChanges(absences, 'new');
      expect(tagged).toHaveLength(1);
      expect(tagged[0]._category).toBe('absence');
      expect(tagged[0]._embed.title).toBe('⚠️ New Absence');
    });

    it('tagTimetableChanges should produce tagged items', () => {
      const changes = [
        { type: 'new', date: 20241015, startTime: 800, endTime: 845, lesson: { su: [{ longname: 'Math' }], ro: [{ name: 'A1' }], te: [{ longname: 'Smith' }] } },
      ];
      const tagged = discord.tagTimetableChanges(changes);
      expect(tagged).toHaveLength(1);
      expect(tagged[0]._category).toBe('timetable');
    });

    it('tagHomeworkChanges should produce tagged items', () => {
      const hw = [{ lessonId: 1, text: 'Do stuff', remark: '', dueDate: new Date() }];
      const tagged = discord.tagHomeworkChanges(hw);
      expect(tagged).toHaveLength(1);
      expect(tagged[0]._category).toBe('homework');
    });

    it('tagExamChanges should produce tagged items', () => {
      const exams = [{ id: 1, name: 'Test', subject: 'Math', examDate: 20241120, startTime: 800, endTime: 900, rooms: [], teachers: [] }];
      const tagged = discord.tagExamChanges(exams);
      expect(tagged).toHaveLength(1);
      expect(tagged[0]._category).toBe('exam');
    });
  });

  describe('sendBatchedNotification', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      });
    });

    it('should not send if changes array is empty', async () => {
      await discord.sendBatchedNotification([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should send a single batch for <= 10 embeds', async () => {
      const changes = Array(5).fill(null).map(() => ({
        _category: 'timetable',
        _embed: { title: 'Test', fields: [], color: 0x000000 },
      }));

      await discord.sendBatchedNotification(changes);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.embeds).toHaveLength(5);
      expect(body.content).toContain('5 changes detected');
      expect(body.content).toContain('<@&999888777>');
    });

    it('should split into multiple batches for > 10 embeds', async () => {
      const changes = Array(15).fill(null).map(() => ({
        _category: 'homework',
        _embed: { title: 'Test', fields: [], color: 0x000000 },
      }));

      await discord.sendBatchedNotification(changes);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // First batch: 10 embeds + content
      const body1 = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body1.embeds).toHaveLength(10);
      expect(body1.content).toBeDefined();

      // Second batch: 5 embeds, no content
      const body2 = JSON.parse(global.fetch.mock.calls[1][1].body);
      expect(body2.embeds).toHaveLength(5);
      expect(body2.content).toBeUndefined();
    });
  });
});
