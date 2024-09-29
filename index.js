import express from 'express';
import { WebUntis } from 'webuntis';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseISO, format, addDays, subDays } from 'date-fns';
import ical from 'ical-generator';
import readline from 'readline';

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
    rangeStartSetting,
    enableDebug,
    enableAbsenceScanning,
    enableHomeworkScanning,
    enableExamScanning,
    enableTimetableChangeScanning,
    enableIcalStreaming,
    disableRoutesExceptIcal
} = secrets;

// File path to store last absence data
const absenceFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'absences.json'); // Path to cached absences
const homeworkFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'homework.json'); // Path to cached homework
const examsFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exams.json'); // Path to cached exams
const timetableFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'timetable.json'); // Path to cached timetable
const miscFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'misc.json'); // Path for misc.json

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionNumber = '1.0.1';

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
        if(enableDebug) {
            console.log('Raw timetable data:', timetable);
        }

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
        
        if(enableDebug) {
            console.log('Raw absent lessons data:', absentLessons);
        }

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
if(!disableRoutesExceptIcal) {
    app.get('/absences', async (req, res) => {
        const absences = await getAbsentLessons();
        res.render('absences', { absences });
    });
}

//////////////////////////////////////
//         ABSENCE NOTIFIER         //
//////////////////////////////////////

// Function to check for absences
async function checkForAbsences() {
    console.log('[UNTIS] Checking for absences...');
    try {
        const absentLessons = await getAbsentLessons();

        if(enableDebug) {
            console.log('Absent lessons:', absentLessons);
        }

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
            if(enableDebug) {
                console.log('New absences:', newAbsences);
            } else {
                console.log("There are new absences. Notifying Discord...");
            }
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
//         TIMETABLE CACHE          //
//////////////////////////////////////

async function cacheTimetable() {
    console.log('[CACHING] Caching timetable...');
    try {
        const rangeStart = new Date(); // Today's date
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
            await notifyDiscordChanges(changes);
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

function formatTimeUntis(time) {
    // Convert integer time (e.g., 845) to HH:MM format
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return `${hours}:${minutes < 10 ? '0' : ''}${minutes}`; // Formats to HH:MM
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

async function notifyDiscordChanges(changes) {
    const messages = changes.map(change => {
        // Check if lessonDate is defined and valid
        const userId = discordUserID; // ID of the user to ping
        let lessonDate;
        if (change.lesson) {
            lessonDate = new Date(`${change.lesson.date.toString().slice(0, 4)}-${change.lesson.date.toString().slice(4, 6)}-${change.lesson.date.toString().slice(6, 8)}`);
        } else {
            console.error('Lesson date is undefined:', change);
            lessonDate = new Date(); // Fallback to current date if undefined
        }

        // Check for undefined start and end times
        const lessonStart = change.startTime ? formatTimeUntis(change.startTime) : 'Unknown start time';
        const lessonEnd = change.endTime ? formatTimeUntis(change.endTime) : 'Unknown end time';

        if(enableDebug) {
            console.log("Lesson date is:", lessonDate, "Lesson start is:", lessonStart, "Lesson end is:", lessonEnd);
        }

        // Prepare message based on lesson type
        let message;

        if (change.type === 'new') {
            // Safe access for new lesson details
            const newLessonName = change.lesson?.su?.[0]?.longname || 'Unknown subject';
            const newRoomName = change.lesson?.ro?.[0]?.name || 'Unknown room';
            const newRoomNameLong = change.lesson?.ro?.[0]?.longname || 'Unknown room';
            const newTeacherName = change.lesson?.te?.[0]?.longname || 'Unknown teacher';

            message = `🆕 New lesson (${newLessonName}) added on ${lessonDate.toLocaleDateString()} ${lessonStart} - ${lessonEnd}: ${newLessonName} in room ${newRoomName} (${newRoomNameLong}) with ${newTeacherName}.\n<@${userId}>`;
        } else if (change.type === 'modified') {
            // Safe access for old lesson details
            const oldLessonName = change.oldLesson?.su?.[0]?.longname || 'Unknown subject';
            const oldRoomName = change.oldLesson?.ro?.[0]?.name || 'Unknown room';
            const oldRoomNameLong = change.oldLesson?.ro?.[0]?.longname || 'Unknown room';
            const oldTeacherName = change.oldLesson?.te?.[0]?.longname || 'Unknown teacher';

            // Safe access for new lesson details
            const newLessonName = change.newLesson?.su?.[0]?.longname || 'Unknown subject';
            const newRoomName = change.newLesson?.ro?.[0]?.name || 'Unknown room';
            const newRoomNameLong = change.newLesson?.ro?.[0]?.longname || 'Unknown room';
            const newTeacherName = change.newLesson?.te?.[0]?.longname || 'Unknown teacher';

            // Create message with old and new lesson details
            message = `🔄 Lesson updated on ${lessonDate.toLocaleDateString()} ${lessonStart} - ${lessonEnd}: 
            \n**Old lesson:** ${oldLessonName} in room ${oldRoomName} (${oldRoomNameLong}) with ${oldTeacherName}.\n**New lesson:** ${newLessonName} in room ${newRoomName} (${newRoomNameLong}) with ${newTeacherName}.\n**Changes:** ${change.details.join(', ')}\n<@${userId}>`;
        } else if (change.type === 'removed') {
            // Accessing the correct lesson that was removed
            const oldLessonName = change.lesson?.su?.[0]?.longname || 'Unknown subject'; // Changed this line
            const oldRoomName = change.lesson?.ro?.[0]?.name || 'Unknown room'; // Changed this line
            const oldRoomNameLong = change.lesson?.ro?.[0]?.longname || 'Unknown room'; // Changed this line
            const oldTeacherName = change.lesson?.te?.[0]?.longname || 'Unknown teacher'; // Changed this line
        
            message = `❌ Lesson (${oldLessonName}) removed on ${lessonDate.toLocaleDateString()} ${lessonStart} - ${lessonEnd}: ${oldLessonName} in room ${oldRoomName} (${oldRoomNameLong}).\n<@${userId}>`;
        }
        

        return message; // Return the generated message
    }).filter(message => message !== null).join('\n'); // Filter out null messages

    // Sending the message to Discord only if there are messages to send
    if (messages) {
        await fetch(secrets.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: messages
            })
        });
    }
}

//////////////////////////////////////
// ICal Streaming (Timetable Sync)  //
//////////////////////////////////////

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
        const icalFilePath = path.join(__dirname, 'timetable.ics');

        // Write the iCal data to a file
        fs.writeFileSync(icalFilePath, calendar.toString());
        console.log('[ICAL] iCal file generated at:', icalFilePath);
    } catch (error) {
        console.error('[ICAL] Error while generating iCal:', error);
    }
}

//Server

// Serve the iCal file at a specific URL
if(enableIcalStreaming) {
app.get('/timetable.ics', (req, res) => {
    const icalFilePath = path.join(__dirname, 'timetable.ics');
    if (fs.existsSync(icalFilePath)) {
        // Set the Content-Type header to 'text/calendar' for iCal files
        res.setHeader('Content-Type', 'text/calendar');
        res.sendFile(icalFilePath);
    } else {
        res.status(404).send('iCal file not found');
    }
});
}


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
if (!disableRoutesExceptIcal) {
    app.get('/homework', async (req, res) => {
        try {
            const homeworkData = await getHomeworkAssignments(); // Call the new function

            if(enableDebug) {
                console.log('Homework assignments:', homeworkData);
            }

            // Render homework.ejs with homework data
            res.render('homework', { homeworks: homeworkData });
        } catch (error) {
            console.error('Error fetching homework:', error);
            res.status(500).send('Error fetching homework assignments.');
        } finally {
            await untis.logout(); // Log out after fetching the homework to free resources
        }
    });
}

//////////////////////////////////////
//         Homework Notifier        //
//////////////////////////////////////

async function checkForHomework() {
    console.log('[UNTIS] Checking for homework...');
    try {
        const homeworkAssignments = await getHomeworkAssignments(); // Fetch homework assignments
        if(enableDebug) {
            console.log('Homework assignments:', homeworkAssignments);
        }

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

        if(enableDebug) {
            console.log('New homework length is:', newHomework.length);
        }

        if (newHomework.length > 0) {
            if(enableDebug) {
                console.log('New homework:', newHomework);
            } else {
                console.log("There are new homework assignments. Notifying Discord...");
            }
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

async function checkForExams(debug) {
    console.log('[UNTIS] Checking for exams...');
    try {
        const rangeStart = new Date(rangeStartSetting); // Start from September 9th, 2024
        const rangeEnd = new Date(); // End at today
        rangeEnd.setDate(rangeEnd.getDate() + 365); // Extend the end date by 365 days

        await untis.login(); // Await the login to the WebUntis instance
        const exams = await untis.getExamsForRange(rangeStart, rangeEnd); // Fetch exams
        
        if(enableDebug) {
            console.log('Exams:', exams);
        }

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

        if(enableDebug || debug) {
            console.log('New exams length is:', newExams.length);
        }

        if (newExams.length > 0) {
            if(enableDebug) {
                console.log('New exams:', newExams);
            } else {
                console.log("There are new exam assignments. Notifying Discord...");
            }
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

if(!disableRoutesExceptIcal) {
    app.get('/exams', async (req, res) => {
        try {
            const rangeStart = new Date(rangeStartSetting); // Start from given range
            const rangeEnd = new Date(); // End at today
            rangeEnd.setDate(rangeEnd.getDate() + 365); // Extend the end date by 365 days

            await untis.login(); // Await the login to the WebUntis instance
            const examsData = await untis.getExamsForRange(rangeStart, rangeEnd); // Fetch exams
            if(enableDebug) {
                console.log('Exams data:', examsData);
            }

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
}

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
if(!disableRoutesExceptIcal) {
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
}

//////////////////////////////////////
// READLINE INTERFACE FOR COMMANDS  //
//////////////////////////////////////

// Create an interface to listen for input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Available commands
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
    },
    status: () => {
        console.log("Current scanner status:");
        console.log(`Timetable scanning: ${enableTimetableChangeScanning ? "Enabled" : "Disabled"}`);
        console.log(`Exam scanning: ${enableExamScanning ? "Enabled" : "Disabled"}`);
        console.log(`Homework scanning: ${enableHomeworkScanning ? "Enabled" : "Disabled"}`);
        console.log(`Absence scanning: ${enableAbsenceScanning ? "Enabled" : "Disabled"}`);
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
    exit: () => {
        console.log("Exiting console...");
        process.exit(0);
    }
};

// Handle input and trigger appropriate command
function listenForCommands() {
    rl.setPrompt("> ");  // Show prompt like in a console
    rl.prompt();
    
    rl.on('line', (input) => {
        const args = input.trim().split(' ');
        const command = args[0].toLowerCase();  // Get the command (first word)
        
        if (commands[command]) {
            commands[command](...args.slice(1));  // Execute the command
        } else {
            console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
        }

        rl.prompt();  // Show prompt again
    });
}


//////////////////////////////////////
//          START SERVER            //
//////////////////////////////////////

function startUntis() {
    printAsciiArt();

    //Respect settings from secrets.js

    if(enableTimetableChangeScanning){
        cacheTimetable();
        setInterval(async () => {
            await cacheTimetable();
        }, checkInterval);
    }

    if(enableExamScanning){
        checkForExams(false);
        setInterval(async () => {
            await checkForExams(false);
        }, checkInterval);
    }

    if(enableHomeworkScanning){
        checkForHomework();
        setInterval(async () => {
            await checkForHomework();
        }, checkInterval);
    }

    if(enableAbsenceScanning){
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

if(enableWebServer){
    app.listen(webServerPort, () => {
        startUntis();
        console.log(`[WEBSERVER] Server now running at http://localhost:${port}`);
        listenForCommands();
    });
} else {
    startUntis();
    listenForCommands();
}
