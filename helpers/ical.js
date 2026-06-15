import ical from 'ical-generator';
import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

//////////////////////////////////////
// ICal Streaming (Timetable Sync)  //
//////////////////////////////////////

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function icalStreaming(timetable) {
  try {
    const calendar = ical({ name: 'School Timetable' });

    timetable.forEach(lesson => {
      if (config.enableDebug) {
        console.log('Lesson data:', lesson);
      }

      // Extract date components
      const year = parseInt(lesson.date.toString().slice(0, 4), 10);
      const month = parseInt(lesson.date.toString().slice(4, 6), 10) - 1;
      const day = parseInt(lesson.date.toString().slice(6, 8), 10);

      // Extract time components
      const startHour = Math.floor(lesson.startTime / 100);
      const startMinute = lesson.startTime % 100;
      const endHour = Math.floor(lesson.endTime / 100);
      const endMinute = lesson.endTime % 100;

      const start = new Date(year, month, day, startHour, startMinute);
      const end = new Date(year, month, day, endHour, endMinute);

      let summary = lesson.su[0]?.longname
        ? lesson.su[0].longname
        : 'Lesson';

      const isCanceled = lesson.code === 'cancelled';
      if (isCanceled) {
        summary = `❌ [CANCELLED] ${summary}`;
      }

      const location = lesson.ro[0]?.name
        ? `${lesson.ro[0].name} (${lesson.ro[0].longname || ''})`
        : 'Classroom';

      const description = lesson.te[0]?.longname
        ? lesson.te[0].longname
        : 'No teacher assigned';

      if (config.enableDebug) {
        console.log('Summary:', summary, 'Location:', location, 'Description:', description);
      }

      calendar.createEvent({
        start,
        end,
        summary,
        location,
        description,
      });
    });

    const icalFilePath = path.join(projectRoot, config.icalFileName);
    fs.writeFileSync(icalFilePath, calendar.toString());
    console.log('[ICAL] iCal file generated at:', icalFilePath);
  } catch (error) {
    console.error('[ICAL] Error while generating iCal:', error);
  }
}

export default {
  icalStreaming,
};