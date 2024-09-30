import { WebUntis } from 'webuntis';
import secrets from '../config.js';
import index from '../index.js';
import fs from 'fs';
import discord from './discord.js';
import icalhelper from './ical.js';

//////////////////////////////////////
//         TIMETABLE CACHE          //
//////////////////////////////////////

const { notifyDiscordTimetable } = discord
const { icalStreaming } = icalhelper;
const { 
    schoolName, 
    username, 
    password, 
    untisURL,
    enableIcalStreaming,
    enableDebug,
} = secrets;

const untis = new WebUntis(schoolName, username, password, untisURL);

// Helper function to get and format the timetable for a specific date
async function getTimetable(date) {
  try {
    await untis.login();
    const timetable = await untis.getOwnTimetableFor(date);

    // Log the detailed info from WebUntis
    if (enableDebug) {
      console.log("Raw timetable data:", timetable);
    }

    const formattedTimetable = timetable.map((lesson) => {
      const startTime = WebUntis.convertUntisTime(lesson.startTime);
      const endTime = WebUntis.convertUntisTime(lesson.endTime);

      // Check if the lesson is canceled by looking for the 'code' property
      const isCanceled = lesson.code === "cancelled";

      return {
        subject:
          lesson.su[0]?.longName || lesson.su[0]?.name || "Unknown Subject",
        room: lesson.ro[0]?.name || "Unknown Room",
        teacher: lesson.te[0]?.name || "Unknown Teacher",
        time: `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`,
        isCanceled: isCanceled
          ? "Canceled"
          : lesson.code
          ? lesson.code
          : "Active", // Mark lesson as canceled if applicable
      };
    });

    await untis.logout();
    return formattedTimetable;
  } catch (error) {
    console.error("Error fetching timetable:", error);
    return [];
  }
}

async function cacheTimetable() {
    console.log('[CACHING] Caching timetable...');
    try {
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - 2); // Start 2 days before today, avoids midday cache issue due to timezones
        if(enableDebug) {
            console.log("Range start is now: " + rangeStart);
        }
        const rangeEnd = new Date();
        rangeEnd.setDate(rangeEnd.getDate() + 14); // 14 days from today

        if (enableDebug) {
            console.log("Set rangeEnd to:", rangeEnd);
        }

        // Login to WebUntis
        await untis.login(secrets.schoolName, secrets.username, secrets.password, secrets.untisURL);

        // Fetch the new timetable for the next two weeks
        const newTimetable = await untis.getOwnTimetableForRange(rangeStart, rangeEnd);

        if (enableDebug) {
            console.log('[CACHING] Fetched new timetable:', newTimetable);
        } else {
            console.log('[CACHING] Fetched new timetable.');
        }

        if(enableIcalStreaming) {
            // Call the icalStreaming function to generate the iCal file
            await icalStreaming(newTimetable);
        }

        // Load the previous timetable from cache if it exists
        const { timetableFilePath, miscFilePath } = index;
        let previousTimetable = [];
        if (fs.existsSync(timetableFilePath)) {
            previousTimetable = JSON.parse(fs.readFileSync(timetableFilePath, 'utf8'));
        }

        // Load the last cached date from misc.json
        let lastCachedDate = null;
        if (fs.existsSync(miscFilePath)) {
            const miscData = JSON.parse(fs.readFileSync(miscFilePath, 'utf8'));
            lastCachedDate = miscData.lastCachedDate;
        }

        // Check the last lesson date in the new timetable
        let newLastDate = newTimetable.length > 0 
            ? Math.max(...newTimetable.map(lesson => lesson.date)) 
            : null;

        if (lastCachedDate && newLastDate) {
            const lastDate = new Date(lastCachedDate.toString().slice(0, 4), 
                                       lastCachedDate.toString().slice(4, 6) - 1, 
                                       lastCachedDate.toString().slice(6, 8));
            const newDate = new Date(newLastDate.toString().slice(0, 4), 
                                      newLastDate.toString().slice(4, 6) - 1, 
                                      newLastDate.toString().slice(6, 8));

            // Check if the new date is exactly one day later than the last cached date
            const oneDayLater = new Date(lastDate);
            oneDayLater.setDate(oneDayLater.getDate() + 1);

            if (newDate.getTime() === oneDayLater.getTime()) {
                // If it's one day later, overwrite the cache and log the action
                fs.writeFileSync(timetableFilePath, JSON.stringify(newTimetable, null, 2));
                console.log('Cache deleted and overwritten with new timetable.');

                // Update the last cached date in misc.json
                fs.writeFileSync(miscFilePath, JSON.stringify({ lastCachedDate: newLastDate }, null, 2));
                return; // Exit the function early to avoid unnecessary notification
            }
        }

        // Compare the new timetable with the cached timetable
        const changes = compareTimetables(previousTimetable, newTimetable);

        if (changes.length > 0) {
            // Notify via Discord about the changes
            await notifyDiscordTimetable(changes);
            console.log('Notified Discord about timetable changes.');
        } else {
            console.log('[CACHING] No significant changes in timetable.');
        }

        // Update the cache with the new timetable (overwrites the old one)
        fs.writeFileSync(timetableFilePath, JSON.stringify(newTimetable, null, 2));
        console.log('[CACHING] Timetable cache updated.');

        // Update the last cached date in misc.json
        fs.writeFileSync(miscFilePath, JSON.stringify({ lastCachedDate: newLastDate }, null, 2));

    } catch (error) {
        console.error('Error while caching timetable:', error);
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
                startTime: newLesson.startTime, // Make sure these are included
                endTime: newLesson.endTime,
            });
        } else {
            const changeDetails = hasLessonChanged(oldLesson, newLesson);
            if (changeDetails) {
                changes.push({
                    type: 'modified',
                    oldLesson,
                    newLesson,
                    details: changeDetails,
                    startTime: newLesson.startTime, // Include these properties
                    endTime: newLesson.endTime,
                });
            }
        }
    }

    for (let oldLesson of oldTimetable) {
        if (!newTimetable.find(lesson => lesson.id === oldLesson.id)) {
            changes.push({
                type: 'removed',
                lesson: oldLesson, // This is correct
                startTime: oldLesson.startTime, // Include the start time for removed lessons
                endTime: oldLesson.endTime, // Include the end time for removed lessons
            });
        }
    }    

    return changes;
}

export default {
    compareTimetables,
    cacheTimetable,
    getTimetable
};