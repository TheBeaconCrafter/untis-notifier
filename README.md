# Untis Notifier

This project is a notification system for Untis, a school scheduling software. It allows users to receive notifications about upcoming events, such as exams, assignments, or class changes.

## Features:
- **Real-time notifications**: The system sends notifications to users whenever there is a change in their schedule.
- **Customizable notifications**: Users can choose which types of events they want to be notified about and how they want to receive the notifications (e.g., Discord Webhooks, Slack Webhooks).
- **iCal Integration**: Sync your timetable to your calendar app with iCal. The calendar stream shows you when, where and with whom your classes are.
- **No exposed ports**: You don't have to expose any ports or have an outward facing server due to the use of webhooks.

**⚠️ IMPORTANT ⚠️** This project was built and tested on Node JS version v20.17.0. It may fail to run on older/newer versions.

## Quick Install:
1. Clone the repository:
   ```bash
   git clone https://github.com/TheBeaconCrafter/untis-notifier.git
   ```
2. Make the install script executable:
   ```bash
   chmod +x setup.sh
   ```
3. Run the install script:
   ```bash
   ./setup.sh
   ```
The script installs screen and npm if not already installed and guides you through the setup process. For manual installation, refer to the paragraph below.

## Manual Install:
1. Clone the repository:
   ```bash
   git clone https://github.com/TheBeaconCrafter/untis-notifier.git
   ```
2. Install the required dependencies:
   ```bash
   npm install node-fetch webuntis path express date-fns ejs ical-generator readline
   ```
3. Set up the configuration file: 
   - Copy the `secretsExample.js` file and rename it to `secrets.js`.
   - Fill in the necessary information, such as your Untis credentials and notification settings.
4. Run the application:
   ```bash
   node index.js
   ```

## iCal Sync
- untis-notify can sync your timetable to your favorite calendar app (provided it supports iCal).
- For this feature to work, go into your secrets.js and enable **enableWebServer**, **enableIcalStreaming** and set your **webServerPort** to one that is open to the web.
- If you want to make sure that nobody can trigger an unauthorized API refresh via the webportal, please enable **disableRoutesExceptIcal** (highly recommended in production).
- Your calendar will be available at http://YOURSERVER:PORT/timetable.ics
- Keep in mind that this calendar is open to anyone with the link
- The calendar will refresh in the same interval that is set for **checkInterval** in your config.js

## Usage:
- The system monitors Untis automatically for changes in exams, homework, absences, and timetable changes every 10 minutes (customizable).
- There is a debug web interface at `http://localhost:3000` which should not (yet) be exposed to the internet. There are options for keeping it off in the secrets file.
- **Note**: This software is in early development, so expect bugs. It was built and tested with node version v20.17.0.

## Contributing:
1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Make your changes and commit them:
   ```bash
   git commit -m 'Add some feature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/your-feature
   ```
5. Submit a pull request.

## License:
This project is licensed under the MIT License. See the `LICENSE` file for more information.
