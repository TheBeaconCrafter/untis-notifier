import { WebUntis } from 'webuntis';
import config from '../config.js';
import db from './database.js';
import discord from './discord.js';
import icalhelper from './ical.js';

//////////////////////////////////////
//         TIMETABLE CACHE          //
//////////////////////////////////////

const { tagTimetableChanges } = discord;
const { icalStreaming } = icalhelper;

const untis = new WebUntis(
  config.untis.schoolName,
  config.untis.username,
  config.untis.password,
  config.untis.url
);

/**
 * Get and format the timetable for a specific date (used by web routes).
 */
async function getTimetable(date) {
  try {
    await untis.login();
    const timetable = await untis.getOwnTimetableFor(date);

    if (config.enableDebug) {
      console.log('Raw timetable data:', timetable);
    }

    const formattedTimetable = timetable.map((lesson) => {
      const startTime = WebUntis.convertUntisTime(lesson.startTime);
      const endTime = WebUntis.convertUntisTime(lesson.endTime);
      const isCanceled = lesson.code === 'cancelled';

      return {
        subject: lesson.su[0]?.longName || lesson.su[0]?.name || 'Unknown Subject',
        room: lesson.ro[0]?.name || 'Unknown Room',
        teacher: lesson.te[0]?.name || 'Unknown Teacher',
        time: `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`,
        isCanceled: isCanceled ? 'Canceled' : lesson.code ? lesson.code : 'Active',
      };
    });

    await untis.logout();
    return formattedTimetable;
  } catch (error) {
    console.error('Error fetching timetable:', error);
    return [];
  }
}

/**
 * Cache timetable and detect changes. Returns an array of tagged changes for batching.
 */
async function cacheTimetable() {
  console.log('[CACHING] Caching timetable...');
  try {
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 2);

    if (config.enableDebug) {
      console.log('Range start is now:', rangeStart);
    }

    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 14);

    if (config.enableDebug) {
      console.log('Set rangeEnd to:', rangeEnd);
    }

    await untis.login();
    const newTimetable = await untis.getOwnTimetableForRange(rangeStart, rangeEnd);

    if (config.enableDebug) {
      console.log('[CACHING] Fetched new timetable:', newTimetable);
    } else {
      console.log('[CACHING] Fetched new timetable.');
    }

    // Generate iCal file if enabled
    if (config.enableIcalStreaming) {
      await icalStreaming(newTimetable);
    }

    // Load the previous timetable from database
    const previousTimetable = db.getTimetableCache().map(row => row.data);

    // Load the last cached date from meta
    const lastCachedDate = db.getMeta('lastCachedDate');

    // Check the earliest lesson date in the new timetable
    let newLastDate = newTimetable.length > 0
      ? Math.min(...newTimetable.map(lesson => lesson.date))
      : null;

    console.log('[CACHING] Last cached date:', lastCachedDate);
    console.log('[CACHING] New last date:', newLastDate);

    if (lastCachedDate && newLastDate) {
      const lastDate = new Date(
        lastCachedDate.toString().slice(0, 4),
        lastCachedDate.toString().slice(4, 6) - 1,
        lastCachedDate.toString().slice(6, 8)
      );
      const newDate = new Date(
        newLastDate.toString().slice(0, 4),
        newLastDate.toString().slice(4, 6) - 1,
        newLastDate.toString().slice(6, 8)
      );

      const oneDayLater = new Date(lastDate);
      oneDayLater.setDate(oneDayLater.getDate() + 1);

      if (newDate.getTime() === oneDayLater.getTime()) {
        db.saveTimetableCache(newTimetable);
        db.setMeta('lastCachedDate', String(newLastDate));
        console.log('[CACHING] Cache deleted and overwritten with new timetable (date rollover).');
        return [];
      }
    }

    // Compare the new timetable with the cached timetable
    const changes = compareTimetables(previousTimetable, newTimetable);

    // Update the cache
    db.saveTimetableCache(newTimetable);
    db.setMeta('lastCachedDate', String(newLastDate));
    console.log('[CACHING] Timetable cache updated.');

    if (changes.length > 0) {
      console.log(`[CACHING] ${changes.length} timetable change(s) detected.`);
      return tagTimetableChanges(changes);
    }

    console.log('[CACHING] No significant changes in timetable.');
    return [];
  } catch (error) {
    console.error('Error while caching timetable:', error);
    return [];
  }
}

function compareTimetables(oldTimetable, newTimetable) {
  const changes = [];

  const hasLessonChanged = (oldLesson, newLesson) => {
    let changeDetails = [];

    if (oldLesson.ro[0]?.name !== newLesson.ro[0]?.name) {
      changeDetails.push(`Room changed from ${oldLesson.ro[0]?.name || 'Unknown'} to ${newLesson.ro[0]?.name || 'Unknown'}`);
    }
    if (oldLesson.te[0]?.name !== newLesson.te[0]?.name) {
      changeDetails.push(`Teacher changed from ${oldLesson.te[0]?.name || 'Unknown'} to ${newLesson.te[0]?.name || 'Unknown'}`);
    }
    if (oldLesson.code !== newLesson.code) {
      changeDetails.push(`Status changed from ${oldLesson.code || 'Normal'} to ${newLesson.code || 'Normal'}`);
    }

    return changeDetails.length > 0 ? changeDetails : null;
  };

  for (let newLesson of newTimetable) {
    const oldLesson = oldTimetable.find(lesson => lesson.id === newLesson.id);

    if (!oldLesson) {
      changes.push({
        type: 'new',
        lesson: newLesson,
        startTime: newLesson.startTime,
        endTime: newLesson.endTime,
        date: newLesson.date,
      });
    } else {
      const changeDetails = hasLessonChanged(oldLesson, newLesson);
      if (changeDetails) {
        changes.push({
          type: 'modified',
          oldLesson,
          newLesson,
          details: changeDetails,
          startTime: newLesson.startTime,
          endTime: newLesson.endTime,
          date: newLesson.date,
        });
      }
    }
  }

  for (let oldLesson of oldTimetable) {
    if (!newTimetable.find(lesson => lesson.id === oldLesson.id)) {
      changes.push({
        type: 'removed',
        lesson: oldLesson,
        startTime: oldLesson.startTime,
        endTime: oldLesson.endTime,
        date: oldLesson.date,
      });
    }
  }

  return changes;
}

export default {
  compareTimetables,
  cacheTimetable,
  getTimetable,
};