import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseISO, format, addDays, subDays } from 'date-fns';
import readline from 'readline';
import fs from 'fs';
import config from './config.js';

import absences from './helpers/absences.js';
import exams from './helpers/exams.js';
import homework from './helpers/homework.js';
import timetableHelper from './helpers/timetable.js';
import discord from './helpers/discord.js';

const { getHomeworkAssignments, checkForHomework } = homework;
const { getAbsentLessons, checkForAbsences } = absences;
const { checkForExams } = exams;
const { cacheTimetable, getTimetable } = timetableHelper;
const { sendBatchedNotification } = discord;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionNumber = '2.0.0';

let routesEnabled = !config.server.disableRoutesExceptIcal;

// Setup Express server
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//////////////////////////////////////
//      SERVER SETUP AND ROUTER     //
//////////////////////////////////////

app.get('/', async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send('Webinterface is disabled.');
  }
  const dateString = req.query.date || new Date().toISOString().split('T')[0];
  const selectedDate = parseISO(dateString);

  const timetable = await getTimetable(selectedDate);

  const previousDay = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  res.render('timetable', {
    timetable,
    date: format(selectedDate, 'yyyy-MM-dd'),
    previousDay,
    nextDay,
  });
});

app.get('/exams', async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send('Webinterface is disabled.');
  }
  try {
    // For the web view, we import WebUntis directly
    const { WebUntis } = await import('webuntis');
    const untis = new WebUntis(
      config.untis.schoolName,
      config.untis.username,
      config.untis.password,
      config.untis.url
    );

    const rangeStart = new Date(config.rangeStart);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 365);

    await untis.login();
    const examsData = await untis.getExamsForRange(rangeStart, rangeEnd);

    if (config.enableDebug) {
      console.log('Exams data:', examsData);
    }

    const formattedExamsData = examsData.map((exam) => {
      const examDateString = String(exam.examDate);
      return {
        ...exam,
        formattedExamDate: formatDateExams(examDateString),
        formattedStartTime: new Date(exam.startTime).toLocaleTimeString(),
        formattedEndTime: new Date(exam.endTime).toLocaleTimeString(),
      };
    });

    res.render('exams', { exams: formattedExamsData, formatDateExams });
    await untis.logout();
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).send('Error fetching exam assignments.');
  }
});

app.get('/homework', async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send('Webinterface is disabled.');
  }
  try {
    const homeworkData = await getHomeworkAssignments();

    if (config.enableDebug) {
      console.log('Homework assignments:', homeworkData);
    }

    res.render('homework', { homeworks: homeworkData });
  } catch (error) {
    console.error('Error fetching homework:', error);
    res.status(500).send('Error fetching homework assignments.');
  }
});

if (config.enableIcalStreaming) {
  const routePath = config.icalFileName.startsWith('/') ? config.icalFileName : `/${config.icalFileName}`;
  app.get(routePath, (req, res) => {
    const icalFilePath = path.join(__dirname, config.icalFileName);
    if (fs.existsSync(icalFilePath)) {
      res.setHeader('Content-Type', 'text/calendar');
      if (config.enableCorsForIcsViewer) {
        res.setHeader('Access-Control-Allow-Origin', 'https://larrybolt.github.io');
      }
      res.sendFile(icalFilePath);
    } else {
      res.status(404).send('iCal file not found');
    }
  });
}

app.post('/check-absences', async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send('Webinterface is disabled.');
  }
  try {
    await checkForAbsences();
    res.status(200).send('Checked absences successfully.');
  } catch (error) {
    console.error('Error checking absences:', error);
    res.status(500).send('Error checking absences.');
  }
});

app.get('/absences', async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send('Webinterface is disabled.');
  }
  const absenceList = await getAbsentLessons();
  res.render('absences', { absences: absenceList });
});

//////////////////////////////////////
// READLINE INTERFACE FOR COMMANDS  //
//////////////////////////////////////

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const commands = {
  help: () => {
    console.log('Available commands:');
    console.log('help          - Displays this help message');
    console.log('status        - Displays the current scanning status');
    console.log('exit          - Exits the console');
    console.log('exams         - Checks for new exams');
    console.log('timetable     - Caches the timetable');
    console.log('absences      - Checks for new absences');
    console.log('homework      - Checks for new homework');
    console.log('cacheall      - Check for all new data');
    console.log('toggleroutes  - Temporarily toggles routes');
  },
  status: () => {
    console.log('Current scanner status:');
    console.log(`  Timetable scanning: ${config.scanning.timetable ? 'Enabled' : 'Disabled'}`);
    console.log(`  Exam scanning:      ${config.scanning.exams ? 'Enabled' : 'Disabled'}`);
    console.log(`  Homework scanning:  ${config.scanning.homework ? 'Enabled' : 'Disabled'}`);
    console.log(`  Absence scanning:   ${config.scanning.absences ? 'Enabled' : 'Disabled'}`);
    console.log(`  Ping target:        ${config.discord.pingTarget.mention || '(none)'}`);
  },
  exams: async () => {
    const changes = await checkForExams(true);
    if (changes.length > 0) await sendBatchedNotification(changes);
  },
  timetable: async () => {
    const changes = await cacheTimetable();
    if (changes.length > 0) await sendBatchedNotification(changes);
  },
  absences: async () => {
    const changes = await checkForAbsences();
    if (changes.length > 0) await sendBatchedNotification(changes);
  },
  homework: async () => {
    const changes = await checkForHomework();
    if (changes.length > 0) await sendBatchedNotification(changes);
  },
  cacheall: async () => {
    await runAllScanners();
  },
  toggleroutes: () => {
    routesEnabled = !routesEnabled;
    console.log('Routes toggled. Enabled:', routesEnabled);
  },
  exit: () => {
    console.log('Exiting...');
    process.exit(0);
  },
};

function listenForCommands() {
  rl.setPrompt('> ');
  rl.prompt();

  rl.on('line', async (input) => {
    const args = input.trim().split(' ');
    const command = args[0].toLowerCase();

    if (commands[command]) {
      await commands[command](...args.slice(1));
    } else {
      console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
    }
    rl.prompt();
  });
}

//////////////////////////////////////
//    BATCHED SCANNING ORCHESTRATOR //
//////////////////////////////////////

/**
 * Run all enabled scanners and send a single batched Discord notification.
 */
async function runAllScanners() {
  const allChanges = [];

  if (config.scanning.timetable) {
    const changes = await cacheTimetable();
    allChanges.push(...changes);
  }

  if (config.scanning.exams) {
    const changes = await checkForExams(false);
    allChanges.push(...changes);
  }

  if (config.scanning.homework) {
    const changes = await checkForHomework();
    allChanges.push(...changes);
  }

  if (config.scanning.absences) {
    const changes = await checkForAbsences();
    allChanges.push(...changes);
  }

  if (allChanges.length > 0) {
    console.log(`[BATCH] Sending ${allChanges.length} change(s) in a single notification.`);
    await sendBatchedNotification(allChanges);
  } else {
    console.log('[BATCH] No changes detected across all scanners.');
  }
}

//////////////////////////////////////
//          START SERVER            //
//////////////////////////////////////

function printAsciiArt() {
  const art = `
              __  .__                                __  .__  _____       
 __ __  _____/  |_|__| ______           ____   _____/  |_|__|/ ____\\__.__.
|  |  \\/    \\   __\\  |/  ___/  ______  /    \\ /  _ \\   __\\  \\   __<   |  |
|  |  /   |  \\  | |  |\\___ \\  /_____/ |   |  (  <_> )  | |  ||  |  \\___  |
|____/|___|  /__| |__/____  >         |___|  /\\____/|__| |__||__|  / ____|
           \\/             \\/               \\/                      \\/      
    `;
  console.log(art);
  console.log(`\nby vncntwww - Version: ${versionNumber}\n\n`);
}

function startUntis() {
  printAsciiArt();

  // Run all scanners immediately on startup
  runAllScanners();

  // Set up the recurring interval
  setInterval(async () => {
    await runAllScanners();
  }, config.scanning.checkInterval);
}

if (config.server.enabled) {
  app.listen(config.server.port, () => {
    startUntis();
    console.log(`[WEBSERVER] Server now running at http://localhost:${config.server.port}`);
    listenForCommands();
  });
} else {
  startUntis();
  listenForCommands();
}

// Helper for exams web route (kept for EJS template compatibility)
function formatDateExams(dateString) {
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  return `${day}.${month}.${year}`;
}