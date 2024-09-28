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

const enableWebServer = false; // Set to true to enable the debug web interface (do not expose to the web!)
const webServerPort = 3000; // Port for the debug web interface

const checkInterval = 600000; // Interval in milliseconds to check for new data (do not set too low to avoid getting rate limited by WebUntis)

const rangeStartSetting = "2024-09-09T00:00:00" // This will be the start of the range for the timetable etc. I recommend setting this to the start of the school year

// Export all secrets
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
    rangeStartSetting
};
