import secrets from '../config.js';
import fetch from 'node-fetch';
import formatter from './formatter.js';

const { 
    discordWebhookUrl,
    discordUserID,
    enableDebug
} = secrets;

const {
    formatTimeUntis
} = formatter;

// Function to send notification to Discord (Absences)
async function notifyDiscordAbsence(absences) {
    const userId = discordUserID; // ID of the user to ping
    const message = {
        content: `⚠️ <@${userId}>, you have new absences:\n` + 
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

async function notifyDiscordTimetable(changes) {
    const messages = changes.map(change => {
        // Check if lessonDate is defined and valid
        const userId = discordUserID; // ID of the user to ping
        let lessonDate;

        if (change.lesson && change.lesson.date) {
            const dateString = change.lesson.date.toString(); // Convert the number to a string
            const year = dateString.slice(0, 4);
            const month = dateString.slice(4, 6);
            const day = dateString.slice(6, 8);

        // Create a date object from the formatted string (month is zero-based in JS)
        lessonDate = new Date(`${year}-${month}-${day}`);
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
    let finalMessage = `📃 <@${userId}>, you have new **homework** assignments:\n` + messageContent;

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
    if(enableDebug) {
        console.log("Message to be sent:\n", finalMessage);
    }

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

// Function to send notification to Discord
async function notifyDiscordExams(exams) {
    console.log("Preparing to send exam notifications...");

    const userId = discordUserID; // ID of the user to ping
    let messageContent = exams.map(exam => {
        const formattedStartTime = formatTimeUntis(exam.startTime); // Format the start time
        const formattedEndTime = formatTimeUntis(exam.endTime); // Format the end time
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
    let finalMessage = `📚 <@${userId}>, you have new **exams** coming up:\n` + messageContent;

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

export default {
    notifyDiscordAbsence,
    notifyDiscordTimetable,
    notifyDiscordHomework,
    notifyDiscordExams
};