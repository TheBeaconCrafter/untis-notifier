import express from 'express';
import { WebUntis } from 'webuntis';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseISO, format, addDays, subDays } from 'date-fns';

import fetch from 'node-fetch';
import fs from 'fs';
import secrets from './secrets.js';

// Destructure the variables from secrets
const { 
    discordWebhookUrl,
    discordUserID,
    schoolName, 
    username, 
    password, 
    untisURL,
    enableWebServer,
    webServerPort,
    checkInterval,
    rangeStartSetting
} = secrets;

// File path to store last absence data
const absenceFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'absences.json'); // Adjusted for ES6 modules
const homeworkFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'homework.json'); // Adjusted for ES6 modules
const examsFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exams.json'); // Adjusted for ES6 modules

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an Express app
const app = express();
const port = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create a WebUntis session
const untis = new WebUntis(schoolName, username, password, untisURL);

// Helper function to get and format the timetable for a specific date
async function getTimetable(date) {
    try {
        await untis.login();
        const timetable = await untis.getOwnTimetableFor(date);

        // Log the detailed info from WebUntis
        console.log('Raw timetable data:', timetable);

        const formattedTimetable = timetable.map(lesson => {
            const startTime = WebUntis.convertUntisTime(lesson.startTime);
            const endTime = WebUntis.convertUntisTime(lesson.endTime);

            // Check if the lesson is canceled by looking for the 'code' property
            const isCanceled = lesson.code === 'cancelled';

            return {
                subject: lesson.su[0]?.longName || lesson.su[0]?.name || 'Unknown Subject',
                room: lesson.ro[0]?.name || 'Unknown Room',
                teacher: lesson.te[0]?.name || 'Unknown Teacher',
                time: `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`,
                isCanceled: isCanceled ? 'Canceled' : (lesson.code ? lesson.code : 'Active') // Mark lesson as canceled if applicable
            };
        });

        await untis.logout();
        return formattedTimetable;

    } catch (error) {
        console.error('Error fetching timetable:', error);
        return [];
    }
}

async function getAbsentLessons() {
    try {
        await untis.login();

        // Set the date range
        const rangeStart = new Date(rangeStartSetting);
        const rangeEnd = new Date(); // End at today

        // Fetch absent lessons
        const absentLessons = await untis.getAbsentLesson(rangeStart, rangeEnd);
        
        console.log('Raw absent lessons data:', absentLessons);

        // Format the absent lessons data
        const formattedAbsentLessons = absentLessons.absences.map(absent => {
            // Convert the startDate from YYYYMMDD to a Date object
            const year = Math.floor(absent.startDate / 10000);
            const month = Math.floor((absent.startDate % 10000) / 100) - 1; // Month is zero-based
            const day = absent.startDate % 100;

            const absentDate = new Date(year, month, day);

            // Format times
            const startTime = formatTime(absent.startTime);
            const endTime = formatTime(absent.endTime);
            const createdTime = formatDate(new Date(absent.createDate));
            const lastEditTime = formatDate(new Date(absent.lastUpdate));

            return {
                studentName: absent.studentName || 'Unknown Student',
                reason: absent.reason || 'No reason provided',
                createdUser: absent.createdUser || 'Unknown User',
                excuseStatus: absent.excuseStatus || 'No status',
                date: format(absentDate, 'yyyy-MM-dd'), // Format the date properly
                isExcused: absent.isExcused ? 'Excused' : 'Unexcused',
                createdTime,
                lastEditTime,
                startTime,
                endTime,
                updatedUser: absent.updatedUser || 'Unknown User'
            };
        });

        await untis.logout();
        return formattedAbsentLessons;

    } catch (error) {
        console.error('Error fetching absent lessons:', error);
        return [];
    }
}

// Helper function to format time
function formatTime(time) {
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`; // Format to 'HH:MM'
}

// Helper function to format date and time
function formatDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' '); // Format to 'YYYY-MM-DD HH:MM:SS'
}

// Route to display absences
app.get('/absences', async (req, res) => {
    const absences = await getAbsentLessons();
    res.render('absences', { absences });
});



//////////////////////////////////////
//         ABSENCE NOTIFIER         //
//////////////////////////////////////

// Function to check for absences
async function checkForAbsences() {
    console.log('Checking for absences...');
    try {
        const absentLessons = await getAbsentLessons();
        console.log('Absent lessons:', absentLessons);

        // Load previous absence data
        let previousAbsences = [];
        if (fs.existsSync(absenceFilePath)) {
            previousAbsences = JSON.parse(fs.readFileSync(absenceFilePath, 'utf8'));
        }

        // Check for new absences based on unique properties
        const newAbsences = absentLessons.filter(absence => 
            !previousAbsences.some(prevAbsence => 
                prevAbsence.studentName === absence.studentName &&
                prevAbsence.date === absence.date &&
                prevAbsence.startTime === absence.startTime &&
                prevAbsence.endTime === absence.endTime
            )
        );

        if (newAbsences.length > 0) {
            // TODO: Notify via Slack or Discord
            console.log('New absences:', newAbsences);
            await notifyDiscordAbsence(newAbsences);

            // Update the local absence file with all current absences
            fs.writeFileSync(absenceFilePath, JSON.stringify(absentLessons, null, 2));
        }
    } catch (error) {
        console.error('Error checking for absences:', error);
    }
}

// Function to send notification to Discord (Absences)
async function notifyDiscordAbsence(absences) {
    const userId = discordUserID; // ID of the user to ping
    const message = {
        content: `<@${userId}>, you have new absences:\n` + 
            absences.map(a => 
                `**${a.studentName} **- ${a.reason} on ${a.date}\n` +
                `**Created by: **${a.createdUser}\n` +
                `**Status: **${a.isExcused}\n` +
                `**Created Time: **${a.createdTime}\n` +
                `**Last Edit Time: **${a.lastEditTime}\n` +
                `**Start Time: **${a.startTime}\n` +
                `**End Time: **${a.endTime}`
            ).join('\n\n')
    };
    
    await fetch(discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
    });
}


app.post('/check-absences', async (req, res) => {
    try {
        await checkForAbsences(); // Call the function you defined to check absences
        res.status(200).send('Checked absences successfully.');
    } catch (error) {
        console.error('Error checking absences:', error);
        res.status(500).send('Error checking absences.');
    }
});

//////////////////////////////////////
//          Homework Route          //
//////////////////////////////////////


async function getHomeworkAssignments() {
    const rangeStart = new Date(rangeStartSetting);
    const rangeEnd = new Date(); // End at today
    rangeEnd.setDate(rangeEnd.getDate() + 14); // Extend the end date by 14 days

    await untis.login(); // Await the login to the WebUntis instance
    const homeworks = await untis.getHomeWorksFor(rangeStart, rangeEnd); // Call getHomeWorksFor

    // Check if homework data is in the expected format
    if (homeworks && homeworks.homeworks && Array.isArray(homeworks.homeworks)) {
        return homeworks.homeworks.map(homework => ({
            ...homework,
            dueDate: new Date(
                Math.floor(homework.dueDate / 10000), // Extract the year
                Math.floor((homework.dueDate % 10000) / 100) - 1, // Extract the month (0-indexed)
                homework.dueDate % 100 // Extract the day
            )
        }));
    } else {
        return []; // Return an empty array if no homework found
    }
}

// Route to display homework assignments for a specific date range
app.get('/homework', async (req, res) => {
    try {
        const homeworkData = await getHomeworkAssignments(); // Call the new function

        console.log('Homework assignments:', homeworkData);

        // Render homework.ejs with homework data
        res.render('homework', { homeworks: homeworkData });
    } catch (error) {
        console.error('Error fetching homework:', error);
        res.status(500).send('Error fetching homework assignments.');
    } finally {
        await untis.logout(); // Log out after fetching the homework to free resources
    }
});

//////////////////////////////////////
//         Homework Notifier        //
//////////////////////////////////////

async function checkForHomework() {
    console.log('Checking for homework...');
    try {
        const homeworkAssignments = await getHomeworkAssignments(); // Fetch homework assignments
        console.log('Homework assignments:', homeworkAssignments);

        // Load previous homework data
        let previousHomework = [];
        if (fs.existsSync(homeworkFilePath)) {
            previousHomework = JSON.parse(fs.readFileSync(homeworkFilePath, 'utf8'));
        }

        // Check for new homework based only on unique IDs
        const newHomework = homeworkAssignments.filter(homework => 
            !previousHomework.some(prevHomework => 
                prevHomework.id === homework.id // Compare only unique ID
            )
        );

        console.log('New homework length is:', newHomework.length);

        if (newHomework.length > 0) {
            console.log('New homework:', newHomework);
            // Notify via Discord
            await notifyDiscordHomework(newHomework);

            // Update the local homework file with all current homework
            fs.writeFileSync(homeworkFilePath, JSON.stringify(homeworkAssignments, null, 2));
        }
    } catch (error) {
        console.error('Error checking for homework:', error);
    }
}

// Function to send notification to Discord
async function notifyDiscordHomework(homework) {
    console.log("Preparing to send homework notifications...");

    const userId = discordUserID; // ID of the user to ping
    let messageContent = homework.map(h => {
        const formattedDueDate = new Date(h.dueDate).toLocaleDateString(); // Format the due date

        // Parse the created date from the format YYYYMMDD
        const createdYear = Math.floor(h.date / 10000);
        const createdMonth = Math.floor((h.date % 10000) / 100) - 1; // 0-indexed month
        const createdDay = h.date % 100;
        const createdTime = new Date(createdYear, createdMonth, createdDay).toLocaleString(); // Format the created time
        return `**Subject ID: **${h.lessonId} - Due Date: ${formattedDueDate}\n` + // Display the subject and due date
               `**Description: **${h.text}\n` +
               `**Remark: **${h.remark}\n` +
               `**Created Time: **${createdTime}`; // Display the created time
    }).join('\n\n');

    // Create the initial message string with user mention
    let finalMessage = `<@${userId}>, you have new **homework** assignments:\n` + messageContent;

    // Check if the final message exceeds 2000 characters
    if (finalMessage.length > 2000) {
        console.log("Message exceeds 2000 characters, truncating...");

        // Calculate how many characters to remove
        const excessLength = finalMessage.length - 2000 + 100; // 100 extra to account for "**AND MORE**"
        
        // Ensure we don't remove more than we have
        if (excessLength < finalMessage.length) {
            finalMessage = finalMessage.slice(0, -excessLength) + "**AND MORE**"; // Remove excess characters and add **AND MORE**
        } else {
            finalMessage = "**AND MORE**"; // If message is too short, just set it to "**AND MORE**"
        }
    }

    // Debugging output for the final message
    console.log("Message to be sent:\n", finalMessage);

    // Create the message object
    const message = {
        content: finalMessage
    };

    try {
        const response = await fetch(discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text(); // Get the error message
            console.error('Error sending webhook:', response.status, errorText);
        } else {
            console.log('Webhook sent successfully!');
        }
    } catch (error) {
        console.error('Error sending webhook:', error);
    }
}

//////////////////////////////////////
//          Exams Notifier          //
//////////////////////////////////////

async function checkForExams() {
    console.log('Checking for exams...');
    try {
        const rangeStart = new Date(rangeStartSetting); // Start from September 9th, 2024
        const rangeEnd = new Date(); // End at today
        rangeEnd.setDate(rangeEnd.getDate() + 365); // Extend the end date by 365 days

        await untis.login(); // Await the login to the WebUntis instance
        const exams = await untis.getExamsForRange(rangeStart, rangeEnd); // Fetch exams
        console.log('Exams:', exams);

        // Load previous exams data
        let previousExams = [];
        if (fs.existsSync(examsFilePath)) {
            previousExams = JSON.parse(fs.readFileSync(examsFilePath, 'utf8'));
        }

        // Check for new exams based on examDate, startTime, and endTime
        const newExams = exams.filter(exam => 
            !previousExams.some(prevExam => 
                prevExam.examDate === exam.examDate && // Compare examDate
                prevExam.startTime === exam.startTime && // Compare startTime
                prevExam.endTime === exam.endTime // Compare endTime
            )
        );

        console.log('New exams length is:', newExams.length);

        if (newExams.length > 0) {
            console.log('New exams:', newExams);
            // Notify via Discord
            await notifyDiscordExams(newExams);

            // Update the local exams file with all current exams
            fs.writeFileSync(examsFilePath, JSON.stringify(exams, null, 2));
        }
    } catch (error) {
        console.error('Error checking for exams:', error);
    }
}

// Function to send notification to Discord
async function notifyDiscordExams(exams) {
    console.log("Preparing to send exam notifications...");

    const userId = discordUserID; // ID of the user to ping
    let messageContent = exams.map(exam => {
        const formattedStartTime = new Date(exam.startTime).toLocaleTimeString(); // Format the start time
        const formattedEndTime = new Date(exam.endTime).toLocaleTimeString(); // Format the end time
        // Parse the created date from the format YYYYMMDD
        const createdYear = Math.floor(exam.examDate / 10000);
        const createdMonth = Math.floor((exam.examDate % 10000) / 100) - 1; // 0-indexed month
        const createdDay = exam.examDate % 100;
        const createdTime = new Date(createdYear, createdMonth, createdDay).toLocaleString(); // Format the created time

        return `**Exam ID:** ${exam.id}\n` +
               `**Name:** ${exam.name}\n` +
               `**Subject:** ${exam.subject}\n` +
               `**Date:** ${createdTime}\n` +
               `**Start Time:** ${formattedStartTime}\n` +
               `**End Time:** ${formattedEndTime}\n` +
               `**Room(s):** ${exam.rooms.join(', ')}\n` +
               `**Teachers:** ${exam.teachers.join(', ')}\n` +
               `**Assigned Students:** ${exam.assignedStudents.map(s => s.displayName).join(', ')}`; // List assigned students
    }).join('\n\n');

    // Create the initial message string with user mention
    let finalMessage = `<@${userId}>, you have new **exams** assignments:\n` + messageContent;

    // Check if the final message exceeds 2000 characters
    if (finalMessage.length > 2000) {
        console.log("Message exceeds 2000 characters, truncating...");

        // Calculate how many characters to remove
        const excessLength = finalMessage.length - 2000 + 100; // 100 extra to account for "**AND MORE**"
        
        // Ensure we don't remove more than we have
        if (excessLength < finalMessage.length) {
            finalMessage = finalMessage.slice(0, -excessLength) + "**AND MORE**"; // Remove excess characters and add **AND MORE**
        } else {
            finalMessage = "**AND MORE**"; // If message is too short, just set it to "**AND MORE**"
        }
    }

    // Debugging output for the final message
    console.log("Message to be sent:\n", finalMessage);

    // Create the message object
    const message = {
        content: finalMessage
    };

    try {
        const response = await fetch(discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text(); // Get the error message
            console.error('Error sending webhook:', response.status, errorText);
        } else {
            console.log('Webhook sent successfully!');
        }
    } catch (error) {
        console.error('Error sending webhook:', error);
    }
}

app.get('/exams', async (req, res) => {
    try {
        const rangeStart = new Date(rangeStartSetting); // Start from given range
        const rangeEnd = new Date(); // End at today
        rangeEnd.setDate(rangeEnd.getDate() + 365); // Extend the end date by 365 days

        await untis.login(); // Await the login to the WebUntis instance
        const examsData = await untis.getExamsForRange(rangeStart, rangeEnd); // Fetch exams
        console.log('Exams data:', examsData);

        // Format examsData to include formatted exam dates
        const formattedExamsData = examsData.map(exam => {
            const examDateString = String(exam.examDate); // Ensure examDate is a string

            return {
                ...exam,
                formattedExamDate: formatDateExams(examDateString), // Convert examDate to readable format
                formattedStartTime: new Date(exam.startTime).toLocaleTimeString(),
                formattedEndTime: new Date(exam.endTime).toLocaleTimeString(),
            };
        });

        // Render exams.ejs with formatted exams data and the formatDateExams function
        res.render('exams', { exams: formattedExamsData, formatDateExams });
    } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).send('Error fetching exam assignments.');
    } finally {
        await untis.logout(); // Log out after fetching the exams to free resources
    }
});

// Function to format date from YYYYMMDD to a more readable format
function formatDateExams(dateString) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}.${month}.${year}`; // Format as DD.MM.YYYY
}


//////////////////////////////////////
// SERVER SETUP AND TIMETABLE ROUTE //
//////////////////////////////////////

// Route to display timetable for a specific day
app.get('/', async (req, res) => {
    // Get the date from the query parameter, or default to today
    const dateString = req.query.date || new Date().toISOString().split('T')[0];
    const selectedDate = parseISO(dateString);
    
    const timetable = await getTimetable(selectedDate);

    // Prepare previous and next day links
    const previousDay = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
    const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

    res.render('timetable', { 
        timetable, 
        date: format(selectedDate, 'yyyy-MM-dd'), 
        previousDay, 
        nextDay 
    });
});

function startUntis() {

    // Check for absences, homework, and exams on startup
    checkForAbsences();
    checkForHomework();
    checkForExams();

    // Set up timer to check for new data (interval is set in secrets.js)
    setInterval(async () => {
        await checkForAbsences();
    }, checkInterval);
    setInterval(async () => {
        await checkForHomework();
    }, checkInterval);
    setInterval(async () => {
        await checkForExams();
    }, checkInterval);
}

if(enableWebServer){
    app.listen(webServerPort, () => {
        console.log(`Server running at http://localhost:${port}`);
        startUntis();
    });
} else {
    startUntis();
}
