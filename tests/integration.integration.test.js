/**
 * Integration tests — Round 2
 *
 * These tests use the REAL credentials from the project root .env file.
 * They actually connect to WebUntis, fetch live data, and send real
 * Discord webhook messages.
 *
 * Run with:  npm test              (runs both unit + integration)
 *            npm run test:integration  (runs only integration)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebUntis } from 'webuntis';
import Database from 'better-sqlite3';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// ─── Load the real .env from project root ────
dotenv.config({ path: path.join(projectRoot, '.env') });

// WebUntis constructor adds 'https://' internally, so strip any protocol and trailing slashes from the URL
const untisUrl = (process.env.UNTIS_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');

// ─── Validate that credentials are present ───
const requiredEnvVars = [
  'DISCORD_WEBHOOK_URL',
  'UNTIS_USERNAME',
  'UNTIS_PASSWORD',
  'UNTIS_URL',
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`\n[INTEGRATION] Skipping: missing env vars: ${missingVars.join(', ')}`);
  console.error('[INTEGRATION] Make sure your .env file in the project root has all required variables.\n');
  describe.skip('Integration Tests (skipped — missing .env)', () => {
    it('skipped', () => {});
  });
} else {

  // ─── Test-specific database (separate from production) ──
  const testDbPath = path.join(projectRoot, 'test-integration.db');
  let testDb;

  // ─── WebUntis client ────────────────────────
  const untis = new WebUntis(
    process.env.UNTIS_SCHOOL_NAME,
    process.env.UNTIS_USERNAME,
    process.env.UNTIS_PASSWORD,
    untisUrl
  );

  describe('Integration Tests (real .env)', () => {

    // ═══════════════════════════════════════════
    //  Setup & Teardown
    // ═══════════════════════════════════════════

    beforeAll(() => {
      // Create a fresh test database
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      testDb = new Database(testDbPath);
      testDb.pragma('journal_mode = WAL');
      testDb.exec(`
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
    });

    afterAll(() => {
      if (testDb) testDb.close();
      // Clean up test database
      try { fs.unlinkSync(testDbPath); } catch {}
      try { fs.unlinkSync(testDbPath + '-wal'); } catch {}
      try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
    });

    // ═══════════════════════════════════════════
    //  1. WebUntis Authentication
    // ═══════════════════════════════════════════

    describe('WebUntis Authentication', () => {
      it('should log in successfully with real credentials', async () => {
        await expect(untis.login()).resolves.not.toThrow();
        await untis.logout();
      });

      it('should fail login with invalid credentials', async () => {
        const badUntis = new WebUntis(
          process.env.UNTIS_SCHOOL_NAME,
          'invalid_user_that_does_not_exist',
          'wrong_password_12345',
          untisUrl
        );
        await expect(badUntis.login()).rejects.toThrow();
      });
    });

    // ═══════════════════════════════════════════
    //  2. WebUntis Data Fetching
    // ═══════════════════════════════════════════

    describe('WebUntis Data Fetching', () => {
      beforeAll(async () => {
        await untis.login();
      });

      afterAll(async () => {
        try { await untis.logout(); } catch {}
      });

      it('should fetch timetable for today', async () => {
        const today = new Date();
        const timetable = await untis.getOwnTimetableFor(today);

        expect(timetable).toBeDefined();
        expect(Array.isArray(timetable)).toBe(true);
        // Timetable may be empty on weekends/holidays, which is fine
        console.log(`[INTEGRATION] Timetable for today: ${timetable.length} lessons`);

        if (timetable.length > 0) {
          const lesson = timetable[0];
          // Verify the Untis API still returns the expected structure
          expect(lesson).toHaveProperty('id');
          expect(lesson).toHaveProperty('date');
          expect(lesson).toHaveProperty('startTime');
          expect(lesson).toHaveProperty('endTime');
          expect(typeof lesson.id).toBe('number');
          expect(typeof lesson.date).toBe('number');
          expect(typeof lesson.startTime).toBe('number');
          expect(typeof lesson.endTime).toBe('number');

          // Check for subject/room/teacher arrays
          expect(lesson).toHaveProperty('su');
          expect(Array.isArray(lesson.su)).toBe(true);
          expect(lesson).toHaveProperty('ro');
          expect(Array.isArray(lesson.ro)).toBe(true);
          expect(lesson).toHaveProperty('te');
          expect(Array.isArray(lesson.te)).toBe(true);
        }
      });

      it('should fetch timetable for a date range', async () => {
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - 2);
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 14);

        const timetable = await untis.getOwnTimetableForRange(rangeStart, rangeEnd);

        expect(timetable).toBeDefined();
        expect(Array.isArray(timetable)).toBe(true);
        console.log(`[INTEGRATION] Timetable range: ${timetable.length} lessons over 16 days`);

        // Over a 16-day range there should be at least some lessons (unless vacation)
        // We just verify the structure is intact
        if (timetable.length > 0) {
          const lesson = timetable[0];
          expect(lesson.id).toBeDefined();
          expect(lesson.date).toBeDefined();
          expect(lesson.startTime).toBeDefined();
          expect(lesson.endTime).toBeDefined();
        }
      });

      it('should fetch absent lessons', async () => {
        const rangeStart = new Date(process.env.RANGE_START || '2024-09-09');
        const rangeEnd = new Date();

        const absentLessons = await untis.getAbsentLesson(rangeStart, rangeEnd);

        expect(absentLessons).toBeDefined();
        expect(absentLessons).toHaveProperty('absences');
        expect(Array.isArray(absentLessons.absences)).toBe(true);
        console.log(`[INTEGRATION] Absences: ${absentLessons.absences.length} records`);

        if (absentLessons.absences.length > 0) {
          const absence = absentLessons.absences[0];
          // Verify API structure
          expect(absence).toHaveProperty('startDate');
          expect(absence).toHaveProperty('startTime');
          expect(absence).toHaveProperty('endTime');
          expect(typeof absence.startDate).toBe('number');
          expect(typeof absence.startTime).toBe('number');
          expect(typeof absence.endTime).toBe('number');
          // These may or may not exist depending on school config
          expect(absence).toHaveProperty('isExcused');
        }
      });

      it('should fetch homework', async () => {
        const rangeStart = new Date(process.env.RANGE_START || '2024-09-09');
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 14);

        const homeworkResult = await untis.getHomeWorksFor(rangeStart, rangeEnd);

        expect(homeworkResult).toBeDefined();
        expect(homeworkResult).toHaveProperty('homeworks');
        expect(Array.isArray(homeworkResult.homeworks)).toBe(true);
        console.log(`[INTEGRATION] Homework: ${homeworkResult.homeworks.length} assignments`);

        if (homeworkResult.homeworks.length > 0) {
          const hw = homeworkResult.homeworks[0];
          // Verify API structure
          expect(hw).toHaveProperty('id');
          expect(hw).toHaveProperty('dueDate');
          expect(hw).toHaveProperty('text');
          expect(typeof hw.id).toBe('number');
          expect(typeof hw.dueDate).toBe('number');
        }
      });

      it('should fetch exams', async () => {
        const rangeStart = new Date(process.env.RANGE_START || '2024-09-09');
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 365);

        const exams = await untis.getExamsForRange(rangeStart, rangeEnd);

        expect(exams).toBeDefined();
        expect(Array.isArray(exams)).toBe(true);
        console.log(`[INTEGRATION] Exams: ${exams.length} records`);

        if (exams.length > 0) {
          const exam = exams[0];
          // Verify API structure
          expect(exam).toHaveProperty('id');
          expect(exam).toHaveProperty('examDate');
          expect(exam).toHaveProperty('startTime');
          expect(exam).toHaveProperty('endTime');
          expect(typeof exam.id).toBe('number');
          expect(typeof exam.examDate).toBe('number');
        }
      });
    });

    // ═══════════════════════════════════════════
    //  3. SQLite Database (real operations)
    // ═══════════════════════════════════════════

    describe('SQLite Database (integration)', () => {
      it('should store and retrieve timetable data fetched from Untis', async () => {
        await untis.login();
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - 2);
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 7);

        const timetable = await untis.getOwnTimetableForRange(rangeStart, rangeEnd);
        await untis.logout();

        if (timetable.length === 0) {
          console.log('[INTEGRATION] No timetable data to store (vacation?)');
          return; // Skip if no data
        }

        // Store in test database
        const deleteAll = testDb.prepare('DELETE FROM timetable');
        const insert = testDb.prepare(`
          INSERT OR REPLACE INTO timetable (id, date, start_time, end_time, data)
          VALUES (@id, @date, @startTime, @endTime, @data)
        `);

        const tx = testDb.transaction((items) => {
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
        tx(timetable);

        // Retrieve and verify
        const stored = testDb.prepare('SELECT * FROM timetable').all();
        expect(stored.length).toBe(timetable.length);
        
        // Verify round-trip JSON integrity for the first fetched item
        const firstItem = testDb.prepare('SELECT * FROM timetable WHERE id = ?').get(timetable[0].id);
        expect(firstItem).toBeDefined();
        
        const parsed = JSON.parse(firstItem.data);
        expect(parsed.id).toBe(timetable[0].id);
        expect(parsed.date).toBe(timetable[0].date);
        expect(parsed.su).toEqual(timetable[0].su);
        expect(parsed.ro).toEqual(timetable[0].ro);
        expect(parsed.te).toEqual(timetable[0].te);

        console.log(`[INTEGRATION] Stored ${stored.length} timetable entries in SQLite`);
      });

      it('should store and retrieve absence data fetched from Untis', async () => {
        await untis.login();
        const rangeStart = new Date(process.env.RANGE_START || '2024-09-09');
        const rangeEnd = new Date();
        const absentResult = await untis.getAbsentLesson(rangeStart, rangeEnd);
        await untis.logout();

        const absences = absentResult.absences;
        if (absences.length === 0) {
          console.log('[INTEGRATION] No absences to store');
          return;
        }

        // Format as the app does
        const formatted = absences.map(a => ({
          studentName: a.studentName || 'Unknown',
          reason: a.reason || 'No reason',
          createdUser: a.createdUser || 'Unknown',
          excuseStatus: a.excuseStatus || '',
          date: String(a.startDate),
          isExcused: a.isExcused ? 'Excused' : 'Unexcused',
          createdTime: String(a.createDate || ''),
          lastEditTime: String(a.lastUpdate || ''),
          startTime: String(a.startTime),
          endTime: String(a.endTime),
          updatedUser: a.updatedUser || 'Unknown',
        }));

        const deleteAll = testDb.prepare('DELETE FROM absences');
        const insert = testDb.prepare(`
          INSERT INTO absences (student_name, reason, created_user, excuse_status, date, is_excused, created_time, last_edit_time, start_time, end_time, updated_user)
          VALUES (@studentName, @reason, @createdUser, @excuseStatus, @date, @isExcused, @createdTime, @lastEditTime, @startTime, @endTime, @updatedUser)
        `);

        const tx = testDb.transaction((items) => {
          deleteAll.run();
          for (const a of items) insert.run(a);
        });
        tx(formatted);

        const stored = testDb.prepare('SELECT * FROM absences').all();
        expect(stored.length).toBe(formatted.length);
        console.log(`[INTEGRATION] Stored ${stored.length} absence records in SQLite`);
      });
    });

    // ═══════════════════════════════════════════
    //  4. Discord Webhook (real send)
    // ═══════════════════════════════════════════

    describe('Discord Webhook', () => {
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

      it('should send a test embed message to the real webhook', async () => {
        const testEmbed = {
          title: '🧪 Integration Test',
          description: 'This is an automated integration test message from untis-notifier v2.0. You can ignore this.',
          color: 0x5865f2, // Discord blurple
          fields: [
            { name: 'Test', value: 'Embed delivery', inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: true },
          ],
          footer: { text: 'untis-notifier integration test' },
          timestamp: new Date().toISOString(),
        };

        const pingTarget = process.env.DISCORD_PING_TARGET || '';
        let mention = '';
        if (pingTarget.startsWith('role:')) mention = `<@&${pingTarget.slice(5)}>`;
        else if (pingTarget.startsWith('user:')) mention = `<@${pingTarget.slice(5)}>`;
        else if (pingTarget) mention = `<@${pingTarget}>`;

        const payload = {
          content: mention
            ? `📋 **Integration test** — verifying webhook delivery\n\n${mention}`
            : '📋 **Integration test** — verifying webhook delivery',
          embeds: [testEmbed],
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        expect(response.ok).toBe(true);
        console.log(`[INTEGRATION] Discord webhook sent: ${response.status}`);
      });

      it('should handle Discord rate limiting gracefully', async () => {
        // Send two messages quickly to test rate limit handling
        const embed = {
          title: '🧪 Rate Limit Test',
          description: 'Testing rapid sends',
          color: 0x95a5a6,
          timestamp: new Date().toISOString(),
        };

        const send = async (n) => {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `Rate limit test message ${n}/2`,
              embeds: [{ ...embed, title: `🧪 Rate Limit Test ${n}/2` }],
            }),
          });

          if (response.status === 429) {
            // Rate limited — this is expected behavior, not a failure
            const body = await response.json();
            console.log(`[INTEGRATION] Rate limited (expected). Retry after: ${body.retry_after}s`);
            return { ok: true, rateLimited: true };
          }

          return { ok: response.ok, rateLimited: false };
        };

        const r1 = await send(1);
        expect(r1.ok).toBe(true);

        const r2 = await send(2);
        expect(r2.ok).toBe(true);
      });

      it('should send a batched notification with multiple embeds', async () => {
        // Build a realistic batched notification
        const embeds = [
          {
            title: '🆕 New Lesson (Test)',
            color: 0x2ecc71,
            fields: [
              { name: 'Subject', value: 'Mathematics', inline: true },
              { name: 'Date', value: '2024-10-15', inline: true },
              { name: 'Time', value: '8:00 – 8:45', inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
          {
            title: '📃 New Homework (Test)',
            color: 0x9b59b6,
            fields: [
              { name: 'Subject ID', value: '42', inline: true },
              { name: 'Due Date', value: '2024-10-20', inline: true },
              { name: 'Description', value: 'Complete worksheet', inline: false },
            ],
            timestamp: new Date().toISOString(),
          },
          {
            title: '📚 New Exam (Test)',
            color: 0xe74c3c,
            fields: [
              { name: 'Name', value: 'Physics Final', inline: true },
              { name: 'Date', value: '2024-11-20', inline: true },
              { name: 'Time', value: '10:00 – 11:30', inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ];

        const pingTarget = process.env.DISCORD_PING_TARGET || '';
        let mention = '';
        if (pingTarget.startsWith('role:')) mention = `<@&${pingTarget.slice(5)}>`;
        else if (pingTarget.startsWith('user:')) mention = `<@${pingTarget.slice(5)}>`;
        else if (pingTarget) mention = `<@${pingTarget}>`;

        const payload = {
          content: mention
            ? `📋 **3 changes detected:** 1 timetable change, 1 homework assignment, 1 new exam\n\n${mention}`
            : '📋 **3 changes detected:** 1 timetable change, 1 homework assignment, 1 new exam',
          embeds,
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        expect(response.ok).toBe(true);
        console.log(`[INTEGRATION] Batched webhook (3 embeds) sent: ${response.status}`);
      });
    });

    // ═══════════════════════════════════════════
    //  5. Full Pipeline: Fetch → Store → Notify
    // ═══════════════════════════════════════════

    describe('Full Pipeline', () => {
      it('should fetch timetable, store in DB, and send notification', async () => {
        // 1. Fetch from Untis
        await untis.login();
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - 2);
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 7);

        const timetable = await untis.getOwnTimetableForRange(rangeStart, rangeEnd);
        await untis.logout();

        console.log(`[INTEGRATION] Pipeline: fetched ${timetable.length} lessons`);

        // 2. Store in test DB
        const deleteAll = testDb.prepare('DELETE FROM timetable');
        const insert = testDb.prepare(`
          INSERT OR REPLACE INTO timetable (id, date, start_time, end_time, data)
          VALUES (@id, @date, @startTime, @endTime, @data)
        `);
        const tx = testDb.transaction((items) => {
          deleteAll.run();
          for (const l of items) {
            insert.run({ id: l.id, date: l.date, startTime: l.startTime, endTime: l.endTime, data: JSON.stringify(l) });
          }
        });
        tx(timetable);

        const stored = testDb.prepare('SELECT COUNT(*) as count FROM timetable').get();
        expect(stored.count).toBe(timetable.length);

        // 3. Build and send a summary notification
        const lessonCount = timetable.length;
        const sampleLesson = timetable.length > 0 ? timetable[0] : null;

        const embed = {
          title: '✅ Pipeline Test Complete',
          color: 0x2ecc71,
          fields: [
            { name: 'Lessons Fetched', value: String(lessonCount), inline: true },
            { name: 'DB Records', value: String(stored.count), inline: true },
            ...(sampleLesson ? [{
              name: 'Sample Lesson',
              value: `ID ${sampleLesson.id} on ${sampleLesson.date} at ${sampleLesson.startTime}`,
              inline: false,
            }] : []),
          ],
          footer: { text: 'Full pipeline integration test' },
          timestamp: new Date().toISOString(),
        };

        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: '✅ **Full pipeline test** — Fetch → SQLite → Discord',
            embeds: [embed],
          }),
        });

        expect(response.ok).toBe(true);
        console.log(`[INTEGRATION] Pipeline test complete: ${lessonCount} lessons → DB → Discord`);
      });
    });

    // ═══════════════════════════════════════════
    //  6. Config Validation (real .env)
    // ═══════════════════════════════════════════

    describe('Config from real .env', () => {
      it('should have all required variables populated', () => {
        expect(process.env.DISCORD_WEBHOOK_URL).toBeTruthy();
        expect(process.env.DISCORD_WEBHOOK_URL).toMatch(/^https:\/\/discord\.com\/api\/webhooks\//);
        expect(process.env.UNTIS_SCHOOL_NAME).toBeDefined(); // allow empty string
        expect(process.env.UNTIS_USERNAME).toBeTruthy();
        expect(process.env.UNTIS_PASSWORD).toBeTruthy();
        expect(process.env.UNTIS_URL).toBeTruthy();
      });

      it('should have a valid ping target format', () => {
        const target = process.env.DISCORD_PING_TARGET;
        if (target) {
          // Should be one of: user:ID, role:ID, or just an ID
          expect(target).toMatch(/^(user:|role:)?\d+$/);
        }
      });

      it('should have a valid webhook URL that accepts GET', async () => {
        // Discord webhook URLs respond to GET with webhook info
        const response = await fetch(process.env.DISCORD_WEBHOOK_URL);
        expect(response.ok).toBe(true);
        const info = await response.json();
        expect(info).toHaveProperty('id');
        expect(info).toHaveProperty('token');
        console.log(`[INTEGRATION] Webhook name: "${info.name}", channel: ${info.channel_id}`);
      });
    });
  });
}
