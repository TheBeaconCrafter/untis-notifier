import { WebUntis } from 'webuntis';
import secrets from '../config.js';
import index from '../index.js';
import fs from 'fs';
import discord from './discord.js';

//////////////////////////////////////
//         Homework Notifier        //
//////////////////////////////////////

const {
    notifyDiscordHomework
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

async function checkForHomework() {
    console.log('[UNTIS] Checking for homework...');
    try {
        const homeworkAssignments = await getHomeworkAssignments(); // Fetch homework assignments
        if(enableDebug) {
            console.log('Homework assignments:', homeworkAssignments);
        }

        // Load previous homework data
        const { homeworkFilePath } = index;
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

export default {
    checkForHomework,
    getHomeworkAssignments
};