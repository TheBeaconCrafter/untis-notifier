import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import db from '../helpers/database.js';

describe('Database Module', () => {
  beforeEach(() => {
    // Use in-memory database for tests
    db._resetForTesting(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Absences', () => {
    const testAbsences = [
      {
        studentName: 'John Doe',
        reason: 'Sick',
        createdUser: 'Admin',
        excuseStatus: 'Excused',
        date: '2024-10-15',
        isExcused: 'Excused',
        createdTime: '2024-10-15 08:00:00',
        lastEditTime: '2024-10-15 09:00:00',
        startTime: '8:00',
        endTime: '12:00',
        updatedUser: 'Admin',
      },
      {
        studentName: 'Jane Smith',
        reason: 'Appointment',
        createdUser: 'Teacher',
        excuseStatus: 'Unexcused',
        date: '2024-10-16',
        isExcused: 'Unexcused',
        createdTime: '2024-10-16 07:30:00',
        lastEditTime: '2024-10-16 07:30:00',
        startTime: '10:00',
        endTime: '11:00',
        updatedUser: 'Teacher',
      },
    ];

    it('should save and retrieve absences', () => {
      db.saveAbsences(testAbsences);
      const result = db.getAbsences();
      expect(result).toHaveLength(2);
      expect(result[0].student_name).toBe('John Doe');
      expect(result[0].reason).toBe('Sick');
      expect(result[1].student_name).toBe('Jane Smith');
    });

    it('should replace absences on save (not append)', () => {
      db.saveAbsences(testAbsences);
      db.saveAbsences([testAbsences[0]]);
      const result = db.getAbsences();
      expect(result).toHaveLength(1);
      expect(result[0].student_name).toBe('John Doe');
    });

    it('should handle empty absences array', () => {
      db.saveAbsences([]);
      const result = db.getAbsences();
      expect(result).toHaveLength(0);
    });
  });

  describe('Homework', () => {
    const testHomework = [
      {
        id: 101,
        lessonId: 5,
        text: 'Read chapter 3',
        remark: 'Quiz next week',
        dueDate: new Date('2024-10-20'),
        date: 20241015,
      },
      {
        id: 102,
        lessonId: 8,
        text: 'Complete worksheet',
        remark: '',
        dueDate: '2024-10-22',
        date: 20241016,
      },
    ];

    it('should save and retrieve homework', () => {
      db.saveHomework(testHomework);
      const result = db.getHomework();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(101);
      expect(result[0].text).toBe('Read chapter 3');
      expect(result[1].id).toBe(102);
    });

    it('should store full homework object in data column', () => {
      db.saveHomework(testHomework);
      const result = db.getHomework();
      expect(result[0].data).toBeDefined();
      expect(result[0].data.id).toBe(101);
      expect(result[0].data.text).toBe('Read chapter 3');
    });

    it('should replace homework on save', () => {
      db.saveHomework(testHomework);
      db.saveHomework([testHomework[1]]);
      const result = db.getHomework();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(102);
    });
  });

  describe('Exams', () => {
    const testExams = [
      {
        id: 201,
        examDate: 20241120,
        startTime: 800,
        endTime: 930,
        name: 'Math Midterm',
        subject: 'Mathematics',
        rooms: ['A101'],
        teachers: ['Mr. Smith'],
      },
    ];

    it('should save and retrieve exams', () => {
      db.saveExams(testExams);
      const result = db.getExams();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
      expect(result[0].data.id).toBe(201);
      expect(result[0].exam_date).toBe(20241120);
      expect(result[0].name).toBe('Math Midterm');
    });

    it('should store full exam object in data column', () => {
      db.saveExams(testExams);
      const result = db.getExams();
      expect(result[0].data.rooms).toEqual(['A101']);
      expect(result[0].data.teachers).toEqual(['Mr. Smith']);
    });
  });

  describe('Timetable', () => {
    const testLessons = [
      { id: 301, date: 20241015, startTime: 800, endTime: 845, su: [{ name: 'MATH' }], ro: [{ name: 'A101' }], te: [{ name: 'Smith' }] },
      { id: 302, date: 20241015, startTime: 850, endTime: 935, su: [{ name: 'ENG' }], ro: [{ name: 'B203' }], te: [{ name: 'Jones' }] },
    ];

    it('should save and retrieve timetable', () => {
      db.saveTimetableCache(testLessons);
      const result = db.getTimetableCache();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(301);
      expect(result[0].date).toBe(20241015);
    });

    it('should store full lesson object in data column', () => {
      db.saveTimetableCache(testLessons);
      const result = db.getTimetableCache();
      expect(result[0].data.su[0].name).toBe('MATH');
      expect(result[1].data.ro[0].name).toBe('B203');
    });

    it('should replace timetable on save', () => {
      db.saveTimetableCache(testLessons);
      db.saveTimetableCache([testLessons[0]]);
      const result = db.getTimetableCache();
      expect(result).toHaveLength(1);
    });
  });

  describe('Meta', () => {
    it('should set and get meta values', () => {
      db.setMeta('lastCachedDate', '20241015');
      expect(db.getMeta('lastCachedDate')).toBe('20241015');
    });

    it('should return null for missing meta keys', () => {
      expect(db.getMeta('nonexistent')).toBeNull();
    });

    it('should update existing meta values', () => {
      db.setMeta('key', 'value1');
      db.setMeta('key', 'value2');
      expect(db.getMeta('key')).toBe('value2');
    });
  });
});
