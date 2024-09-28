#!/bin/bash

# Print ASCII art
cat << "EOF"
              __  .__                                __  .__  _____       
 __ __  _____/  |_|__| ______           ____   _____/  |_|__|/ ____\__.__.
|  |  \/    \   __\  |/  ___/  ______  /    \ /  _ \   __\  \   __<   |  |
|  |  /   |  \  | |  |\___ \  /_____/ |   |  (  <_> )  | |  ||  |  \___  |
|____/|___|  /__| |__/____  >         |___|  /\____/|__| |__||__|  / ____|
           \/             \/               \/                      \/     
EOF

# Ask the user if they want to run the script
read -p "Do you want to run the setup script? This script will install screen and npm if not already installed and guide you through the setup process. (y/n): " answer

if [[ "$answer" != "y" ]]; then
    echo "Setup aborted."
    exit 0
fi

# Function to prompt for true/false input
prompt_true_false() {
    local prompt_message=$1
    local variable_name=$2
    while true; do
        read -p "$prompt_message (true/false): " input
        if [[ "$input" == "true" || "$input" == "false" ]]; then
            eval "$variable_name=\"$input\""
            break
        elif [[ -z "$input" ]]; then
            echo "Input cannot be empty. Please enter 'true' or 'false'."
        else
            echo "Invalid input. Please enter 'true' or 'false'."
        fi
    done
}

# Ask for user input on each variable
read -p "Enter your Discord Webhook URL: " discordWebhookUrl
read -p "Enter your Discord User ID: " discordUserID
read -p "Enter your school name (you can find this in the URL bar when you log in on the web, replace + with space): " schoolName
read -p "Enter your WebUntis username: " username
read -sp "Enter your WebUntis password: " password
echo ""
read -p "Enter your WebUntis base URL (e.g., borys.webuntis.com, you can find this in the URL bar when you log in in the browser): " untisURL
prompt_true_false "Enable Web Server? (Not recommended, do not expose to the web)" enableWebServer
read -p "Enter the web server port (default 3000): " webServerPort
webServerPort=${webServerPort:-3000}
read -p "Enter check interval in milliseconds (default 600000): " checkInterval
checkInterval=${checkInterval:-600000}
prompt_true_false "Enable absence scanning?" enableAbsenceScanning
prompt_true_false "Enable homework scanning?" enableHomeworkScanning
prompt_true_false "Enable exam scanning?" enableExamScanning
prompt_true_false "Enable timetable change scanning?" enableTimetableChangeScanning
read -p "Enter the range start setting (e.g., 2024-09-09T00:00:00, default is 2024-09-09T00:00:00): " rangeStartSetting
rangeStartSetting=${rangeStartSetting:-2024-09-09T00:00:00} # Default to specified date
prompt_true_false "Enable debug mode?" enableDebug

# Confirm all inputs before proceeding
echo ""
echo "You have entered the following values:"
echo "Discord Webhook URL: $discordWebhookUrl"
echo "Discord User ID: $discordUserID"
echo "School Name: $schoolName"
echo "WebUntis Username: $username"
echo "WebUntis Password: [hidden]"
echo "WebUntis Base URL: $untisURL"
echo "Enable Web Server: $enableWebServer"
echo "Web Server Port: $webServerPort"
echo "Check Interval: $checkInterval"
echo "Enable Absence Scanning: $enableAbsenceScanning"
echo "Enable Homework Scanning: $enableHomeworkScanning"
echo "Enable Exam Scanning: $enableExamScanning"
echo "Enable Timetable Change Scanning: $enableTimetableChangeScanning"
echo "Range Start Setting: $rangeStartSetting"
echo "Enable Debug Mode: $enableDebug"

read -p "Do you want to proceed with the installation? (y/n): " confirm

if [[ "$confirm" != "y" ]]; then
    echo "Setup aborted."
    exit 0
fi

# Install necessary packages
echo "Installing screen..."
sudo apt-get update && sudo apt-get install -y screen

# Install npm if it's not already installed
if ! command -v npm &> /dev/null; then
    echo "Installing npm..."
    sudo apt-get install -y npm
fi

echo "Installing npm packages..."
npm install node-fetch webuntis path express date-fns ejs

# Create start.sh file
echo "Creating start.sh..."
echo "#!/bin/bash" > start.sh
echo "screen -dmS untis-notify node index.js" >> start.sh
echo "echo 'Untis Notify is active. Please open the screen session to debug.'" >> start.sh
echo "echo 'To enter the screen session, run: screen -r untis-notify'" >> start.sh
echo "echo 'To close the screen session, press Ctrl+A then D'" >> start.sh
chmod +x start.sh

# Create secrets.js file
echo "Creating secrets.js..."
cat << EOF > secrets.js
///////////////////////////////////
//            SECRETS            //
///////////////////////////////////

// After you have filled in the following information, rename this file to secrets.js

// Discord Webhook URL
const discordWebhookUrl = '$discordWebhookUrl'; // Replace with your Discord Webhook URL
const discordUserID = '$discordUserID'; // Replace with your personal Discord User ID (this allows the bot to mention you so you get pings)

// WebUntis credentials and settings
const schoolName = '$schoolName'; // Replace with your school name
const username = '$username'; // Replace with your WebUntis username
const password = '$password'; // Replace with your WebUntis password
const untisURL = '$untisURL'; // Log into Webuntis online, search for your school and press login. Copy the base URL and paste it here (ex. borys.webuntis.com)

const enableWebServer = $enableWebServer; // Set to true to enable the debug web interface (do not expose to the web!)
const webServerPort = $webServerPort; // Port for the debug web interface

const checkInterval = $checkInterval; // Interval in milliseconds to check for new data (do not set too low to avoid getting rate limited by WebUntis)
const enableAbsenceScanning = $enableAbsenceScanning; // Set to true to enable absence scanning
const enableHomeworkScanning = $enableHomeworkScanning; // Set to true to enable homework scanning
const enableExamScanning = $enableExamScanning; // Set to true to enable exam scanning
const enableTimetableChangeScanning = $enableTimetableChangeScanning; // Set to true to enable exam scanning

const rangeStartSetting = "$rangeStartSetting"; // This will be the start of the range for the timetable etc. I recommend setting this to the start of the school year

const enableDebug = $enableDebug; // Set to true to enable debug mode (more output in the console)

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
    rangeStartSetting,
    enableDebug,
    enableAbsenceScanning,
    enableHomeworkScanning,
    enableExamScanning,
    enableTimetableChangeScanning
};
EOF

echo "Setup completed! Please review the settings in secrets.js and make any necessary adjustments."
