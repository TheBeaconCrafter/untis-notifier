import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseISO, format, addDays, subDays } from "date-fns";
import readline from "readline";
import fs from "fs";
import secrets from "./config.js";

// Variables from secrets.js (now config.js)
const {
  enableWebServer,
  webServerPort,
  checkInterval,
  rangeStartSetting,
  enableDebug,
  enableAbsenceScanning,
  enableHomeworkScanning,
  enableExamScanning,
  enableTimetableChangeScanning,
  enableIcalStreaming,
  disableRoutesExceptIcal,
} = secrets;

import absences from "./helpers/absences.js";
import exams from "./helpers/exams.js";
import homework from "./helpers/homework.js";
import timetable from "./helpers/timetable.js";

const { getHomeworkAssignments, checkForHomework } = homework;
const { getAbsentLessons, checkForAbsences } = absences;
const { checkForExams } = exams;
const { cacheTimetable, getTimetable } = timetable;

let routesEnabled = !disableRoutesExceptIcal;

// File paths where cached data is stored
const absenceFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "absences.json"
);
const homeworkFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "homework.json"
);
const examsFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "exams.json"
);
const timetableFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "timetable.json"
);
const miscFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "misc.json"
);

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionNumber = "1.0.1";

// Setup Express server
const app = express();
const port = process.env.PORT || 3000;
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//////////////////////////////////////
//      SERVER SETUP AND ROUTER     //
//////////////////////////////////////

app.get("/", async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send("Webinterface is disabled.");
  }
  const dateString = req.query.date || new Date().toISOString().split("T")[0];
  const selectedDate = parseISO(dateString);

  const timetable = await getTimetable(selectedDate);

  const previousDay = format(subDays(selectedDate, 1), "yyyy-MM-dd");
  const nextDay = format(addDays(selectedDate, 1), "yyyy-MM-dd");

  res.render("timetable", {
    timetable,
    date: format(selectedDate, "yyyy-MM-dd"),
    previousDay,
    nextDay,
  });
});

app.get("/exams", async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send("Webinterface is disabled.");
  }
  try {
    const rangeStart = new Date(rangeStartSetting); // Start from given range in config
    const rangeEnd = new Date(); // End at today
    rangeEnd.setDate(rangeEnd.getDate() + 365); // Extend the end date by 365 days (I hope you don't have exams planned for more than a year)

    await untis.login();
    const examsData = await untis.getExamsForRange(rangeStart, rangeEnd);
    if (enableDebug) {
      console.log("Exams data:", examsData);
    }

    const formattedExamsData = examsData.map((exam) => {
      const examDateString = String(exam.examDate); // Ensure examDate is a string

      return {
        ...exam,
        formattedExamDate: formatDateExams(examDateString), // Convert examDate to readable format
        formattedStartTime: new Date(exam.startTime).toLocaleTimeString(),
        formattedEndTime: new Date(exam.endTime).toLocaleTimeString(),
      };
    });

    res.render("exams", { exams: formattedExamsData, formatDateExams });
  } catch (error) {
    console.error("Error fetching exams:", error);
    res.status(500).send("Error fetching exam assignments.");
  } finally {
    await untis.logout();
  }
});

app.get("/homework", async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send("Webinterface is disabled.");
  }
  try {
    const homeworkData = await getHomeworkAssignments();

    if (enableDebug) {
      console.log("Homework assignments:", homeworkData);
    }

    res.render("homework", { homeworks: homeworkData });
  } catch (error) {
    console.error("Error fetching homework:", error);
    res.status(500).send("Error fetching homework assignments.");
  } finally {
    await untis.logout();
  }
});

if (enableIcalStreaming) {
  app.get("/timetable.ics", (req, res) => {
    const icalFilePath = path.join(__dirname, "timetable.ics");
    if (fs.existsSync(icalFilePath)) {
      // Set the Content-Type header to 'text/calendar' for iCal files, may help with compatibility for some clients
      res.setHeader("Content-Type", "text/calendar");
      res.sendFile(icalFilePath);
    } else {
      res.status(404).send("iCal file not found");
    }
  });
}

app.post("/check-absences", async (req, res) => {
    if (!routesEnabled) {
    return res.status(403).send("Webinterface is disabled.");
    }
    try {
        await checkForAbsences();
        res.status(200).send("Checked absences successfully.");
    } catch (error) {
        console.error("Error checking absences:", error);
        res.status(500).send("Error checking absences.");
    }
});

app.get("/absences", async (req, res) => {
  if (!routesEnabled) {
    return res.status(403).send("Webinterface is disabled.");
  }
  const absences = await getAbsentLessons();
  res.render("absences", { absences });
});

//////////////////////////////////////
// READLINE INTERFACE FOR COMMANDS  //
//////////////////////////////////////

// Create an interface to listen for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const commands = {
  help: () => {
    console.log("Available commands:");
    console.log("help - Displays this help message");
    console.log("status - Displays the current scanning status");
    console.log("exit - Exits the console");
    console.log("exams - Checks for new exams");
    console.log("timetable - Caches the timetable");
    console.log("absences - Checks for new absences");
    console.log("homework - Checks for new homework");
    console.log("temptoggleroutes - Temporarily toggles routes");
  },
  status: () => {
    console.log("Current scanner status:");
    console.log(
      `Timetable scanning: ${
        enableTimetableChangeScanning ? "Enabled" : "Disabled"
      }`
    );
    console.log(
      `Exam scanning: ${enableExamScanning ? "Enabled" : "Disabled"}`
    );
    console.log(
      `Homework scanning: ${enableHomeworkScanning ? "Enabled" : "Disabled"}`
    );
    console.log(
      `Absence scanning: ${enableAbsenceScanning ? "Enabled" : "Disabled"}`
    );
  },
  exams: () => {
    checkForExams(true);
  },
  timetable: () => {
    cacheTimetable();
  },
  absences: () => {
    checkForAbsences();
  },
  homework: () => {
    checkForHomework();
  },
  temptoggleroutes: () => {
    routesEnabled = !routesEnabled;
    console.log("Temporary toggled routes. Are routes enabled:", routesEnabled);
  },
  exit: () => {
    console.log("Exiting console...");
    process.exit(0);
  },
};

function listenForCommands() {
  rl.setPrompt("> "); // Show prompt like in Minecraft server console :D
  rl.prompt();

  rl.on("line", (input) => {
    const args = input.trim().split(" ");
    const command = args[0].toLowerCase(); // Get the command (only first word)

    if (commands[command]) {
      commands[command](...args.slice(1));
    } else {
      console.log(
        `Unknown command: ${command}. Type 'help' for available commands.`
      );
    }
    rl.prompt(); // Show prompt again
  });
}

//////////////////////////////////////
//          START SERVER            //
//////////////////////////////////////

function startUntis() {
  printAsciiArt();

  if (enableTimetableChangeScanning) {
    cacheTimetable();
    setInterval(async () => {
      await cacheTimetable();
    }, checkInterval);
  }

  if (enableExamScanning) {
    checkForExams(false);
    setInterval(async () => {
      await checkForExams(false);
    }, checkInterval);
  }

  if (enableHomeworkScanning) {
    checkForHomework();
    setInterval(async () => {
      await checkForHomework();
    }, checkInterval);
  }

  if (enableAbsenceScanning) {
    checkForAbsences();
    setInterval(async () => {
      await checkForAbsences();
    }, checkInterval);
  }
}

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

if (enableWebServer) {
  app.listen(webServerPort, () => {
    startUntis();
    console.log(`[WEBSERVER] Server now running at http://localhost:${port}`);
    listenForCommands();
  });
} else {
  startUntis();
  listenForCommands();
}

export default {
  absenceFilePath,
  timetableFilePath,
  homeworkFilePath,
  miscFilePath,
  examsFilePath,
  __dirname,
  __filename,
};