import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data.db');

let _db = null;

/**
 * Get or create the database connection and ensure tables exist.
 */
function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL'); // Better concurrent read performance
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS absences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      reason TEXT,
      created_user TEXT,
      excuse_status TEXT,
      date TEXT NOT NULL,
      is_excused TEXT,
      created_time TEXT,
      last_edit_time TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      updated_user TEXT
    );

    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY,
      lesson_id INTEGER,
      text TEXT,
      remark TEXT,
      due_date TEXT,
      date INTEGER,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY,
      exam_date INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      name TEXT,
      subject TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY,
      date INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return _db;
}

// ─── Absences ────────────────────────────────

function getAbsences() {
  const db = getDb();
  return db.prepare('SELECT * FROM absences').all();
}

function saveAbsences(absences) {
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM absences');
  const insert = db.prepare(`
    INSERT INTO absences (student_name, reason, created_user, excuse_status, date, is_excused, created_time, last_edit_time, start_time, end_time, updated_user)
    VALUES (@studentName, @reason, @createdUser, @excuseStatus, @date, @isExcused, @createdTime, @lastEditTime, @startTime, @endTime, @updatedUser)
  `);

  const tx = db.transaction((items) => {
    deleteAll.run();
    for (const a of items) {
      insert.run({
        studentName: a.studentName,
        reason: a.reason,
        createdUser: a.createdUser,
        excuseStatus: a.excuseStatus,
        date: a.date,
        isExcused: a.isExcused,
        createdTime: a.createdTime,
        lastEditTime: a.lastEditTime,
        startTime: a.startTime,
        endTime: a.endTime,
        updatedUser: a.updatedUser,
      });
    }
  });

  tx(absences);
}

// ─── Homework ────────────────────────────────

function getHomework() {
  const db = getDb();
  return db.prepare('SELECT * FROM homework').all().map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : null,
  }));
}

function saveHomework(homeworkList) {
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM homework');
  const insert = db.prepare(`
    INSERT OR REPLACE INTO homework (id, lesson_id, text, remark, due_date, date, data)
    VALUES (@id, @lessonId, @text, @remark, @dueDate, @date, @data)
  `);

  const tx = db.transaction((items) => {
    deleteAll.run();
    for (const h of items) {
      insert.run({
        id: h.id,
        lessonId: h.lessonId || null,
        text: h.text || '',
        remark: h.remark || '',
        dueDate: h.dueDate instanceof Date ? h.dueDate.toISOString() : String(h.dueDate || ''),
        date: h.date || null,
        data: JSON.stringify(h),
      });
    }
  });

  tx(homeworkList);
}

// ─── Exams ───────────────────────────────────

function getExams() {
  const db = getDb();
  return db.prepare('SELECT * FROM exams').all().map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : null,
  }));
}

function saveExams(examsList) {
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM exams');
  const insert = db.prepare(`
    INSERT OR REPLACE INTO exams (id, exam_date, start_time, end_time, name, subject, data)
    VALUES (@id, @examDate, @startTime, @endTime, @name, @subject, @data)
  `);

  const tx = db.transaction((items) => {
    deleteAll.run();
    for (const e of items) {
      insert.run({
        id: null,
        examDate: e.examDate,
        startTime: e.startTime,
        endTime: e.endTime,
        name: e.name || '',
        subject: e.subject || '',
        data: JSON.stringify(e),
      });
    }
  });

  tx(examsList);
}

// ─── Timetable ───────────────────────────────

function getTimetableCache() {
  const db = getDb();
  return db.prepare('SELECT * FROM timetable').all().map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : null,
  }));
}

function saveTimetableCache(lessons) {
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM timetable');
  const insert = db.prepare(`
    INSERT OR REPLACE INTO timetable (id, date, start_time, end_time, data)
    VALUES (@id, @date, @startTime, @endTime, @data)
  `);

  const tx = db.transaction((items) => {
    deleteAll.run();
    for (const l of items) {
      insert.run({
        id: l.id,
        date: l.date,
        startTime: l.startTime,
        endTime: l.endTime,
        data: JSON.stringify(l),
      });
    }
  });

  tx(lessons);
}

// ─── Meta ────────────────────────────────────

function getMeta(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(value));
}

// ─── Cleanup ─────────────────────────────────

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Reset the database connection — used in tests to start fresh.
 */
function _resetForTesting(dbPath) {
  close();
  if (dbPath) {
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS absences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_name TEXT NOT NULL,
        reason TEXT,
        created_user TEXT,
        excuse_status TEXT,
        date TEXT NOT NULL,
        is_excused TEXT,
        created_time TEXT,
        last_edit_time TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        updated_user TEXT
      );
      CREATE TABLE IF NOT EXISTS homework (
        id INTEGER PRIMARY KEY,
        lesson_id INTEGER,
        text TEXT,
        remark TEXT,
        due_date TEXT,
        date INTEGER,
        data TEXT
      );
      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY,
        exam_date INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        name TEXT,
        subject TEXT,
        data TEXT
      );
      CREATE TABLE IF NOT EXISTS timetable (
        id INTEGER PRIMARY KEY,
        date INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        data TEXT
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }
}

export default {
  getDb,
  getAbsences,
  saveAbsences,
  getHomework,
  saveHomework,
  getExams,
  saveExams,
  getTimetableCache,
  saveTimetableCache,
  getMeta,
  setMeta,
  close,
  _resetForTesting,
};
