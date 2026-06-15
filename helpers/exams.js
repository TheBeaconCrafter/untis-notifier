import { WebUntis } from 'webuntis';
import config from '../config.js';
import db from './database.js';
import discord from './discord.js';

//////////////////////////////////////
//          Exams Notifier          //
//////////////////////////////////////

const { tagExamChanges } = discord;

const untis = new WebUntis(
  config.untis.schoolName,
  config.untis.username,
  config.untis.password,
  config.untis.url
);

/**
 * Check for new exams. Returns an array of tagged changes for batching.
 */
async function checkForExams(debug = false) {
  console.log('[UNTIS] Checking for exams...');
  try {
    const rangeStart = new Date(config.rangeStart);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 365);

    await untis.login();
    const exams = await untis.getExamsForRange(rangeStart, rangeEnd);

    if (config.enableDebug) {
      console.log('Exams:', exams);
    }

    // Load previous exams from database
    const previousExams = db.getExams();

    // Check for new exams based on examDate, startTime, and endTime
    const newExams = exams.filter(exam =>
      !previousExams.some(prev =>
        prev.exam_date === exam.examDate &&
        prev.start_time === exam.startTime &&
        prev.end_time === exam.endTime &&
        prev.name === exam.name &&
        prev.subject === exam.subject
      )
    );

    if (config.enableDebug || debug) {
      console.log('New exams length is:', newExams.length);
    }

    // Save all current exams to database
    db.saveExams(exams);

    if (newExams.length > 0) {
      console.log('[UNTIS] New exam assignments detected.');
      return tagExamChanges(newExams);
    }

    return [];
  } catch (error) {
    console.error('Error checking for exams:', error);
    return [];
  }
}

export default {
  checkForExams,
};