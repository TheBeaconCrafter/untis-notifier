import ical from 'ical-generator';
import secrets from '../config.js';
import index from '../index.js';
import fs from 'fs';
import path from 'path';

//////////////////////////////////////
// ICal Streaming (Timetable Sync)  //
//////////////////////////////////////

const { 
    enableDebug,
} = secrets;

async function icalStreaming(timetable) {
    try {
        const calendar = ical({ name: 'School Timetable' });

        timetable.forEach(lesson => {
            // Create the start and end times from lesson data
            if(enableDebug) {
                console.log("Lesson data:", lesson);
            }
            
            // Extract date components
            const year = parseInt(lesson.date.toString().slice(0, 4), 10);
            const month = parseInt(lesson.date.toString().slice(4, 6), 10) - 1; // Month is 0-indexed
            const day = parseInt(lesson.date.toString().slice(6, 8), 10);

            // Extract start time components
            const startHour = Math.floor(lesson.startTime / 100); // Get the hour (e.g., 945 -> 9)
            const startMinute = lesson.startTime % 100; // Get the minute (e.g., 945 -> 45)

            // Extract end time components (assuming endTime is provided in the same format)
            const endHour = Math.floor(lesson.endTime / 100);
            const endMinute = lesson.endTime % 100;

            // Create start and end date objects
            const start = new Date(year, month, day, startHour, startMinute);
            const end = new Date(year, month, day, endHour, endMinute);

            // Use lesson's subject name, fallback to "Lesson"
            const summary = lesson.su[0] && lesson.su[0].longname 
                ? lesson.su[0].longname 
                : 'Lesson';

            if(enableDebug) {
                console.log("Summary is:", summary);
            }

            // Use room name and longname if available, fallback to "Classroom"
            const location = lesson.ro[0] && lesson.ro[0].name 
                ? `${lesson.ro[0].name} (${lesson.ro[0].longname || ''})` 
                : 'Classroom';

            if(enableDebug) {
                console.log("Location is:", location);
            }

            // Use teachers' names if available, fallback to "No teacher assigned"
            const description = lesson.te[0] && lesson.te[0].longname
                ? lesson.te[0].longname 
                : 'No teacher assigned';

            if(enableDebug) {
                console.log("Description is:", description);
            }

            // Add an event to the iCal calendar
            calendar.createEvent({
                start: start,
                end: end,
                summary: summary, // Lesson name as summary
                location: location, // Room number + longname as location
                description: description // Teachers as description
            });
        });

        // Define the path where the iCal file will be saved
        const { __dirname } = index;
        const icalFilePath = path.join(__dirname, 'timetable.ics');

        // Write the iCal data to a file
        fs.writeFileSync(icalFilePath, calendar.toString());
        console.log('[ICAL] iCal file generated at:', icalFilePath);
    } catch (error) {
        console.error('[ICAL] Error while generating iCal:', error);
    }
}

export default {
    icalStreaming
};