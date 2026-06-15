import formatter from './formatter.js';
import { WebUntis } from 'webuntis';
import config from '../config.js';
import { format } from 'date-fns';
import db from './database.js';
import discord from './discord.js';

//////////////////////////////////////
//         ABSENCE NOTIFIER         //
//////////////////////////////////////

const { formatTimeUntis, formatDateIso } = formatter;
const { tagAbsenceChanges } = discord;

const untis = new WebUntis(
  config.untis.schoolName,
  config.untis.username,
  config.untis.password,
  config.untis.url
);

async function getAbsentLessons() {
  try {
    await untis.login();

    const rangeStart = new Date(config.rangeStart);
    const rangeEnd = new Date();

    const absentLessons = await untis.getAbsentLesson(rangeStart, rangeEnd);

    if (config.enableDebug) {
      console.log('Raw absent lessons data:', absentLessons);
    }

    const formattedAbsentLessons = absentLessons.absences.map(absent => {
      const year = Math.floor(absent.startDate / 10000);
      const month = Math.floor((absent.startDate % 10000) / 100) - 1;
      const day = absent.startDate % 100;
      const absentDate = new Date(year, month, day);

      const startTime = formatTimeUntis(absent.startTime);
      const endTime = formatTimeUntis(absent.endTime);
      const createdTime = formatDateIso(new Date(absent.createDate));
      const lastEditTime = formatDateIso(new Date(absent.lastUpdate));

      return {
        studentName: absent.studentName || 'Unknown Student',
        reason: absent.reason || 'No reason provided',
        createdUser: absent.createdUser || 'Unknown User',
        excuseStatus: absent.excuseStatus || 'No status',
        date: format(absentDate, 'yyyy-MM-dd'),
        isExcused: absent.isExcused ? 'Excused' : 'Unexcused',
        createdTime,
        lastEditTime,
        startTime,
        endTime,
        updatedUser: absent.updatedUser || 'Unknown User',
      };
    });

    await untis.logout();
    return formattedAbsentLessons;
  } catch (error) {
    console.error('Error fetching absent lessons:', error);
    return [];
  }
}

/**
 * Check for absence changes. Returns an array of tagged changes for batching.
 */
async function checkForAbsences() {
  console.log('[UNTIS] Checking for absences...');
  try {
    const absentLessons = await getAbsentLessons();

    if (config.enableDebug) {
      console.log('Absent lessons:', absentLessons);
    }

    // Load previous absence data from database
    const previousAbsences = db.getAbsences().map(row => ({
      studentName: row.student_name,
      reason: row.reason,
      createdUser: row.created_user,
      excuseStatus: row.excuse_status,
      date: row.date,
      isExcused: row.is_excused,
      createdTime: row.created_time,
      lastEditTime: row.last_edit_time,
      startTime: row.start_time,
      endTime: row.end_time,
      updatedUser: row.updated_user,
    }));

    const batchedChanges = [];

    // Check for new absences
    const newAbsences = absentLessons.filter(absence =>
      !previousAbsences.some(prev =>
        prev.studentName === absence.studentName &&
        prev.date === absence.date &&
        prev.startTime === absence.startTime &&
        prev.endTime === absence.endTime
      )
    );

    // Check for excused/modified absences
    const excusedAbsences = absentLessons.filter(absence =>
      previousAbsences.some(prev =>
        prev.studentName === absence.studentName &&
        prev.date === absence.date &&
        prev.startTime === absence.startTime &&
        prev.endTime === absence.endTime &&
        prev.isExcused !== absence.isExcused &&
        absence.isExcused === 'Excused'
      )
    );

    // Check for removed absences
    const removedAbsences = previousAbsences.filter(prev =>
      !absentLessons.some(absence =>
        prev.studentName === absence.studentName &&
        prev.date === absence.date &&
        prev.startTime === absence.startTime &&
        prev.endTime === absence.endTime
      )
    );

    if (removedAbsences.length > 0) {
      console.log('[UNTIS] Some absences were removed.');
      batchedChanges.push(...tagAbsenceChanges(removedAbsences, 'removed'));
    }

    if (excusedAbsences.length > 0) {
      console.log('[UNTIS] Some absences were excused.');
      batchedChanges.push(...tagAbsenceChanges(excusedAbsences, 'modified'));
    }

    if (newAbsences.length > 0) {
      console.log('[UNTIS] New absences detected.');
      batchedChanges.push(...tagAbsenceChanges(newAbsences, 'new'));
    }

    // Save current state to database
    db.saveAbsences(absentLessons);

    return batchedChanges;
  } catch (error) {
    console.error('Error checking for absences:', error);
    return [];
  }
}

export default {
  getAbsentLessons,
  checkForAbsences,
};