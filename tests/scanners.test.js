import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  default: {
    discord: {
      webhookUrl: 'https://discord.com/api/webhooks/test/token',
      pingTarget: { type: 'user', id: '123', mention: '<@123>' },
    },
    untis: {
      schoolName: 'Test School',
      username: 'testuser',
      password: 'testpass',
      url: 'https://test.webuntis.com',
    },
    scanning: {
      checkInterval: 600000,
      absences: true,
      homework: true,
      exams: true,
      timetable: true,
    },
    rangeStart: '2024-09-09T00:00:00',
    enableIcalStreaming: false,
    enableDebug: false,
  },
}));

// Mock WebUntis
vi.mock('webuntis', () => {
  const mockUntis = {
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getAbsentLesson: vi.fn().mockResolvedValue({
      absences: [
        {
          startDate: 20241015,
          startTime: 800,
          endTime: 1200,
          studentName: 'John Doe',
          reason: 'Sick',
          createdUser: 'Admin',
          excuseStatus: 'Excused',
          isExcused: true,
          createDate: '2024-10-15T08:00:00Z',
          lastUpdate: '2024-10-15T09:00:00Z',
          updatedUser: 'Admin',
        },
      ],
    }),
    getExamsForRange: vi.fn().mockResolvedValue([
      {
        id: 201,
        examDate: 20241120,
        startTime: 800,
        endTime: 930,
        name: 'Math Midterm',
        subject: 'Mathematics',
        rooms: ['A101'],
        teachers: ['Mr. Smith'],
        assignedStudents: [{ displayName: 'John Doe' }],
      },
    ]),
    getHomeWorksFor: vi.fn().mockResolvedValue({
      homeworks: [
        {
          id: 101,
          lessonId: 5,
          text: 'Read chapter 3',
          remark: 'Quiz next week',
          dueDate: 20241020,
          date: 20241015,
        },
      ],
    }),
    getOwnTimetableFor: vi.fn().mockResolvedValue([]),
    getOwnTimetableForRange: vi.fn().mockResolvedValue([
      {
        id: 301,
        date: 20241015,
        startTime: 800,
        endTime: 845,
        su: [{ name: 'MATH', longname: 'Mathematics' }],
        ro: [{ name: 'A101', longname: 'Room 101' }],
        te: [{ name: 'Smith', longname: 'Mr. Smith' }],
      },
    ]),
  };

  return {
    WebUntis: vi.fn(function() { return mockUntis; }),
  };
});

// Mock database
vi.mock('../helpers/database.js', () => ({
  default: {
    getAbsences: vi.fn().mockReturnValue([]),
    saveAbsences: vi.fn(),
    getHomework: vi.fn().mockReturnValue([]),
    saveHomework: vi.fn(),
    getExams: vi.fn().mockReturnValue([]),
    saveExams: vi.fn(),
    getTimetableCache: vi.fn().mockReturnValue([]),
    saveTimetableCache: vi.fn(),
    getMeta: vi.fn().mockReturnValue(null),
    setMeta: vi.fn(),
  },
}));

// Mock ical helper
vi.mock('../helpers/ical.js', () => ({
  default: {
    icalStreaming: vi.fn().mockResolvedValue(undefined),
  },
}));

import absences from '../helpers/absences.js';
import examsModule from '../helpers/exams.js';
import homework from '../helpers/homework.js';
import timetable from '../helpers/timetable.js';
import db from '../helpers/database.js';

describe('Scanner Modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Absences', () => {
    it('should fetch and format absent lessons', async () => {
      const result = await absences.getAbsentLessons();
      expect(result).toHaveLength(1);
      expect(result[0].studentName).toBe('John Doe');
      expect(result[0].reason).toBe('Sick');
      expect(result[0].isExcused).toBe('Excused');
      expect(result[0].date).toBe('2024-10-15');
      expect(result[0].startTime).toBe('8:00');
      expect(result[0].endTime).toBe('12:00');
    });

    it('should detect new absences and return tagged changes', async () => {
      db.getAbsences.mockReturnValue([]);
      const changes = await absences.checkForAbsences();
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]._category).toBe('absence');
      expect(changes[0]._embed.title).toBe('⚠️ New Absence');
    });

    it('should not return changes when absences are unchanged', async () => {
      db.getAbsences.mockReturnValue([
        {
          student_name: 'John Doe',
          reason: 'Sick',
          created_user: 'Admin',
          excuse_status: 'Excused',
          date: '2024-10-15',
          is_excused: 'Excused',
          created_time: '2024-10-15 08:00:00',
          last_edit_time: '2024-10-15 09:00:00',
          start_time: '8:00',
          end_time: '12:00',
          updated_user: 'Admin',
        },
      ]);

      const changes = await absences.checkForAbsences();
      expect(changes).toHaveLength(0);
    });

    it('should detect removed absences', async () => {
      db.getAbsences.mockReturnValue([
        {
          student_name: 'John Doe',
          date: '2024-10-15',
          start_time: '8:00',
          end_time: '12:00',
          reason: 'Sick',
          created_user: 'Admin',
          excuse_status: 'Excused',
          is_excused: 'Excused',
          created_time: '2024-10-15 08:00:00',
          last_edit_time: '2024-10-15 09:00:00',
          updated_user: 'Admin',
        },
        {
          student_name: 'Jane Smith',
          date: '2024-10-16',
          start_time: '10:00',
          end_time: '11:00',
          reason: 'Appointment',
          created_user: 'Teacher',
          excuse_status: 'Unexcused',
          is_excused: 'Unexcused',
          created_time: '2024-10-16 07:30:00',
          last_edit_time: '2024-10-16 07:30:00',
          updated_user: 'Teacher',
        },
      ]);

      const changes = await absences.checkForAbsences();
      // Should detect that Jane's absence was removed
      const removedChanges = changes.filter(c => c._embed.title === '✅ Absence Removed');
      expect(removedChanges.length).toBeGreaterThan(0);
    });

    it('should save absences to database after check', async () => {
      await absences.checkForAbsences();
      expect(db.saveAbsences).toHaveBeenCalled();
    });
  });

  describe('Exams', () => {
    it('should detect new exams and return tagged changes', async () => {
      db.getExams.mockReturnValue([]);
      const changes = await examsModule.checkForExams(false);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]._category).toBe('exam');
      expect(changes[0]._embed.title).toBe('📚 New Exam');
    });

    it('should not return changes when exams are unchanged', async () => {
      db.getExams.mockReturnValue([
        { exam_date: 20241120, start_time: 800, end_time: 930, name: 'Math Midterm', subject: 'Mathematics' },
      ]);

      const changes = await examsModule.checkForExams(false);
      expect(changes).toHaveLength(0);
    });

    it('should save exams to database after check', async () => {
      await examsModule.checkForExams(false);
      expect(db.saveExams).toHaveBeenCalled();
    });
  });

  describe('Homework', () => {
    it('should detect new homework and return tagged changes', async () => {
      db.getHomework.mockReturnValue([]);
      const changes = await homework.checkForHomework();
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]._category).toBe('homework');
      expect(changes[0]._embed.title).toBe('📃 New Homework');
    });

    it('should not return changes when homework is unchanged', async () => {
      db.getHomework.mockReturnValue([{ id: 101 }]);
      const changes = await homework.checkForHomework();
      expect(changes).toHaveLength(0);
    });

    it('should save homework to database after check', async () => {
      await homework.checkForHomework();
      expect(db.saveHomework).toHaveBeenCalled();
    });

    it('should format homework assignments correctly', async () => {
      const assignments = await homework.getHomeworkAssignments();
      expect(assignments).toHaveLength(1);
      expect(assignments[0].id).toBe(101);
      expect(assignments[0].text).toBe('Read chapter 3');
      expect(assignments[0].dueDate).toBeInstanceOf(Date);
    });
  });

  describe('Timetable', () => {
    it('should detect new lessons and return tagged changes', async () => {
      db.getTimetableCache.mockReturnValue([]);
      db.getMeta.mockReturnValue(null);

      const changes = await timetable.cacheTimetable();
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]._category).toBe('timetable');
    });

    it('should not return changes when timetable is unchanged', async () => {
      db.getTimetableCache.mockReturnValue([
        {
          id: 301,
          date: 20241015,
          data: {
            id: 301,
            date: 20241015,
            startTime: 800,
            endTime: 845,
            su: [{ name: 'MATH', longname: 'Mathematics' }],
            ro: [{ name: 'A101', longname: 'Room 101' }],
            te: [{ name: 'Smith', longname: 'Mr. Smith' }],
          },
        },
      ]);

      const changes = await timetable.cacheTimetable();
      expect(changes).toHaveLength(0);
    });

    it('should save timetable to database after check', async () => {
      await timetable.cacheTimetable();
      expect(db.saveTimetableCache).toHaveBeenCalled();
      expect(db.setMeta).toHaveBeenCalledWith('lastCachedDate', expect.any(String));
    });

    it('should detect modified lessons', () => {
      const oldTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }], code: undefined },
      ];
      const newTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'B202' }], te: [{ name: 'Smith' }], code: undefined },
      ];

      const changes = timetable.compareTimetables(oldTimetable, newTimetable);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].details[0]).toContain('Room changed');
    });

    it('should detect removed lessons', () => {
      const oldTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }] },
        { id: 2, date: 20241015, startTime: 850, endTime: 935, su: [{ name: 'ENG' }], ro: [{ name: 'B202' }], te: [{ name: 'Jones' }] },
      ];
      const newTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }] },
      ];

      const changes = timetable.compareTimetables(oldTimetable, newTimetable);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('removed');
      expect(changes[0].lesson.id).toBe(2);
    });

    it('should detect new lessons', () => {
      const oldTimetable = [];
      const newTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }] },
      ];

      const changes = timetable.compareTimetables(oldTimetable, newTimetable);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('new');
    });

    it('should handle cancelled status changes', () => {
      const oldTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }], code: undefined },
      ];
      const newTimetable = [
        { id: 1, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }], code: 'cancelled' },
      ];

      const changes = timetable.compareTimetables(oldTimetable, newTimetable);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].details[0]).toContain('Status changed');
    });
  });
});
