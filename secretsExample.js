///////////////////////////////////
//            SECRETS            //
///////////////////////////////////

// After you have filled in the following information, rename this file to secrets.js

// Discord Webhook URL
const discordWebhookUrl = 'https://discord.com/api/webhooks/????????'; // Replace with your Discord Webhook URL
const discordUserID = 'YOURDISCORDID'; // Replace with your personal Discord User ID (this allows the bot to mention you so you get pings)

// WebUntis credentials and settings
const schoolName = 'my school'; // Replace with your school name
const username = 'Doe_John'; // Replace with your WebUntis username
const password = '123456'; // Replace with your WebUntis password
const untisURL = 'https://xxxxx.webuntis.com'; // Log into Webuntis online, search for your school and press login. Copy the base URL and paste it here (ex. borys.webuntis.com)

const enableWebServer = false; // Set to true to enable the debug web interface, required for iCal sync
const webServerPort = 3000; // Port for the debug web interface
const disableRoutesExceptIcal = true; // Set to true to disable all routes except the iCal route (recommended for prod to keep the server secure)

const checkInterval = 600000; // Interval in milliseconds to check for new data (do not set too low to avoid getting rate limited by WebUntis)
const enableAbsenceScanning = true; // Set to true to enable absence scanning
const enableHomeworkScanning = true; // Set to true to enable homework scanning
const enableExamScanning = true; // Set to true to enable exam scanning
const enableTimetableChangeScanning = true; // Set to true to enable exam scanning

const rangeStartSetting = "2024-09-09T00:00:00" // This will be the start of the range for the timetable etc. I recommend setting this to the start of the school year

const enableIcalStreaming = false; // Set to true to enable iCal sync (this will allow you to sync your timetable with your calendar app) - Only works if web server is on

const enableDebug = false; // Set to true to enable debug mode (more ourput in the console)

// Export all secrets - do not modify!
export default {
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
};
