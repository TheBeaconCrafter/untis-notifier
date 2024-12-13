import formatter from './formatter.js';
import index from '../index.js';
import { WebUntis } from 'webuntis';
import secrets from '../config.js';
import { format } from 'date-fns';
import fs from 'fs';
import discord from './discord.js';

//////////////////////////////////////
//         ABSENCE NOTIFIER         //
//////////////////////////////////////

const { 
    schoolName, 
    username, 
    password, 
    untisURL,
    rangeStartSetting,
    enableDebug,
} = secrets;

const {
    notifyDiscordAbsence,
    notifyDiscordAbsenceModified,
    notifyDiscordAbsenceRemoved,
} = discord;

const { 
    formatTimeUntis,
    formatDateIso
} = formatter;

const untis = new WebUntis(schoolName, username, password, untisURL);

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
            const startTime = formatTimeUntis(absent.startTime);
            const endTime = formatTimeUntis(absent.endTime);
            const createdTime = formatDateIso(new Date(absent.createDate));
            const lastEditTime = formatDateIso(new Date(absent.lastUpdate));

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

// Function to check for absences
async function checkForAbsences() {
    console.log('[UNTIS] Checking for absences...');
    try {
        const absentLessons = await getAbsentLessons();

        if(enableDebug) {
            console.log('Absent lessons:', absentLessons);
        }

        // Load previous absence data
        const { 
            absenceFilePath
        } = index;
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

        const excusedAbsences = absentLessons.filter(absence => 
            previousAbsences.some(prevAbsence => 
                prevAbsence.studentName === absence.studentName &&
                prevAbsence.date === absence.date &&
                prevAbsence.startTime === absence.startTime &&
                prevAbsence.endTime === absence.endTime &&
                prevAbsence.isExcused !== absence.isExcused && 
                absence.isExcused === 'Excused'
            )
        );
        
        const removedAbsences = previousAbsences.filter(prevAbsence =>
            !absentLessons.some(absence => 
                prevAbsence.studentName === absence.studentName &&
                prevAbsence.date === absence.date &&
                prevAbsence.startTime === absence.startTime &&
                prevAbsence.endTime === absence.endTime
            )
        );

        if (removedAbsences.length > 0) {
            console.log("Some absences were removed. Notifying Discord...");
            if(enableDebug) {
                console.log('Removed absences:', removedAbsences);
            }
            notifyDiscordAbsenceRemoved(removedAbsences);
        } else {
            if(enableDebug) {
                console.log("No absences were removed.");
            }
        }

        if (excusedAbsences.length > 0) {
            console.log("New absences were excused. Notifying Discord...");
            if(enableDebug) {
                console.log('New excused absences:', excusedAbsences);
            }
            notifyDiscordAbsenceModified(excusedAbsences);
        } else {
            if(enableDebug) {
                console.log('No new excused absences.');
            }
        }

        if (newAbsences.length > 0) {
            // TODO: Notify via Slack or Discord
            if(enableDebug) {
                console.log('New absences:', newAbsences);
            } else {
                console.log("There are new absences. Notifying Discord...");
            }
            await notifyDiscordAbsence(newAbsences);
        }
        fs.writeFileSync(absenceFilePath, JSON.stringify(absentLessons, null, 2));
        
    } catch (error) {
        console.error('Error checking for absences:', error);
    }
}

export default {
    getAbsentLessons,
    checkForAbsences
};