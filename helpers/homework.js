import { WebUntis } from 'webuntis';
import config from '../config.js';
import db from './database.js';
import discord from './discord.js';

//////////////////////////////////////
//         Homework Notifier        //
//////////////////////////////////////

const { tagHomeworkChanges } = discord;

const untis = new WebUntis(
  config.untis.schoolName,
  config.untis.username,
  config.untis.password,
  config.untis.url
);

async function getHomeworkAssignments() {
  const rangeStart = new Date(config.rangeStart);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 14);

  await untis.login();
  const homeworks = await untis.getHomeWorksFor(rangeStart, rangeEnd);

  if (homeworks && homeworks.homeworks && Array.isArray(homeworks.homeworks)) {
    return homeworks.homeworks.map(homework => ({
      ...homework,
      dueDate: new Date(
        Math.floor(homework.dueDate / 10000),
        Math.floor((homework.dueDate % 10000) / 100) - 1,
        homework.dueDate % 100
      ),
    }));
  } else {
    return [];
  }
}

/**
 * Check for new homework. Returns an array of tagged changes for batching.
 */
async function checkForHomework() {
  console.log('[UNTIS] Checking for homework...');
  try {
    const homeworkAssignments = await getHomeworkAssignments();

    if (config.enableDebug) {
      console.log('Homework assignments:', homeworkAssignments);
    }

    // Load previous homework from database
    const previousHomework = db.getHomework();

    // Check for new homework based on unique IDs
    const newHomework = homeworkAssignments.filter(homework =>
      !previousHomework.some(prev => prev.id === homework.id)
    );

    if (config.enableDebug) {
      console.log('New homework length is:', newHomework.length);
    }

    // Save all current homework to database
    db.saveHomework(homeworkAssignments);

    if (newHomework.length > 0) {
      console.log('[UNTIS] New homework assignments detected.');
      return tagHomeworkChanges(newHomework);
    }

    return [];
  } catch (error) {
    console.error('Error checking for homework:', error);
    return [];
  }
}

export default {
  checkForHomework,
  getHomeworkAssignments,
};