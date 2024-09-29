import { WebUntis } from 'webuntis';
import secrets from '../config.js';
import index from '../index.js';
import fs from 'fs';
import discord from './discord.js';

//////////////////////////////////////
//          Exams Notifier          //
//////////////////////////////////////

const {
    notifyDiscordExams
} = discord

const { 
    schoolName, 
    username, 
    password, 
    untisURL,
    rangeStartSetting,
    enableDebug,
} = secrets;

const untis = new WebUntis(schoolName, username, password, untisURL);

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
        const { examsFilePath } = index;
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

export default {
    checkForExams
};