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

echo ""
echo "untis-notifier v2.0 setup"
echo "========================="
echo ""

# Ask the user if they want to run the script
read -p "Do you want to run the setup script? (y/n): " answer

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

# ── Discord settings ──
echo ""
echo "── Discord Settings ──"
read -p "Enter your Discord Webhook URL: " discordWebhookUrl
echo ""
echo "Who should be pinged when changes are detected?"
echo "  Enter 'user:YOUR_DISCORD_USER_ID' to ping a specific user"
echo "  Enter 'role:YOUR_DISCORD_ROLE_ID' to ping a role (group ping)"
echo "  Leave empty for no ping"
read -p "Ping target: " discordPingTarget

# ── WebUntis credentials ──
echo ""
echo "── WebUntis Credentials ──"
read -p "Enter your school name (as in the WebUntis URL, replace + with space): " schoolName
read -p "Enter your WebUntis username: " username
read -sp "Enter your WebUntis password: " password
echo ""
read -p "Enter your WebUntis base URL (e.g., borys.webuntis.com): " untisURL

# ── Server settings ──
echo ""
echo "── Server Settings ──"
prompt_true_false "Enable Web Server? (Not recommended unless you need iCal sync)" enableWebServer
read -p "Enter the web server port (default 3000): " webServerPort
webServerPort=${webServerPort:-3000}
prompt_true_false "Disable all routes except iCal? (Recommended for production)" disableRoutesWoIcal

# ── Scanning settings ──
echo ""
echo "── Scanning Settings ──"
read -p "Enter check interval in milliseconds (default 600000 = 10 min): " checkInterval
checkInterval=${checkInterval:-600000}
prompt_true_false "Enable absence scanning?" enableAbsenceScanning
prompt_true_false "Enable homework scanning?" enableHomeworkScanning
prompt_true_false "Enable exam scanning?" enableExamScanning
prompt_true_false "Enable timetable change scanning?" enableTimetableChangeScanning
prompt_true_false "Enable iCal streaming (sync timetable to calendar apps)?" enableIcalStreaming

# ── Misc ──
echo ""
echo "── Misc ──"
read -p "Enter range start date (e.g., 2024-09-09T00:00:00): " rangeStartSetting
rangeStartSetting=${rangeStartSetting:-2024-09-09T00:00:00}
prompt_true_false "Enable debug mode?" enableDebug

# Confirm
echo ""
echo "═══════════════════════════════════"
echo "  Configuration Summary"
echo "═══════════════════════════════════"
echo "Discord Webhook URL: $discordWebhookUrl"
echo "Discord Ping Target: ${discordPingTarget:-'(none)'}"
echo "School Name: $schoolName"
echo "WebUntis Username: $username"
echo "WebUntis Password: [hidden]"
echo "WebUntis Base URL: $untisURL"
echo "Enable Web Server: $enableWebServer"
echo "Web Server Port: $webServerPort"
echo "Disable Routes (except iCal): $disableRoutesWoIcal"
echo "Check Interval: $checkInterval ms"
echo "Absence Scanning: $enableAbsenceScanning"
echo "Homework Scanning: $enableHomeworkScanning"
echo "Exam Scanning: $enableExamScanning"
echo "Timetable Scanning: $enableTimetableChangeScanning"
echo "iCal Streaming: $enableIcalStreaming"
echo "Range Start: $rangeStartSetting"
echo "Debug Mode: $enableDebug"
echo "═══════════════════════════════════"

read -p "Proceed with installation? (y/n): " confirm

if [[ "$confirm" != "y" ]]; then
    echo "Setup aborted."
    exit 0
fi

# Install npm dependencies
echo ""
echo "Installing dependencies..."
npm install

# Create .env file
echo "Creating .env file..."
cat << EOF > .env
# ── Discord ──
DISCORD_WEBHOOK_URL=$discordWebhookUrl
DISCORD_PING_TARGET=$discordPingTarget

# ── WebUntis ──
UNTIS_SCHOOL_NAME=$schoolName
UNTIS_USERNAME=$username
UNTIS_PASSWORD=$password
UNTIS_URL=$untisURL

# ── Server ──
ENABLE_WEB_SERVER=$enableWebServer
WEB_SERVER_PORT=$webServerPort
DISABLE_ROUTES_EXCEPT_ICAL=$disableRoutesWoIcal

# ── Scanning ──
CHECK_INTERVAL=$checkInterval
ENABLE_ABSENCE_SCANNING=$enableAbsenceScanning
ENABLE_HOMEWORK_SCANNING=$enableHomeworkScanning
ENABLE_EXAM_SCANNING=$enableExamScanning
ENABLE_TIMETABLE_SCANNING=$enableTimetableChangeScanning

# ── Misc ──
RANGE_START=$rangeStartSetting
ENABLE_ICAL_STREAMING=$enableIcalStreaming
ENABLE_DEBUG=$enableDebug
EOF

# Create start.sh file
echo "Creating start.sh..."
echo "#!/bin/bash" > start.sh
echo "screen -dmS untis-notify node index.js" >> start.sh
echo "echo 'Untis Notify is active. Please open the screen session to debug.'" >> start.sh
echo "echo 'To enter the screen session, run: screen -r untis-notify'" >> start.sh
echo "echo 'To close the screen session, press Ctrl+A then D'" >> start.sh
chmod +x start.sh

echo ""
echo "✅ Setup completed!"
echo "Review your .env file and run: npm start"
echo ""
