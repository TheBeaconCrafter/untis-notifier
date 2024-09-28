# Untis Notifier

This project is a notification system for Untis, a school scheduling software. It allows users to receive notifications about upcoming events, such as exams, assignments, or class changes.

## Features:
- **Real-time notifications**: The system sends notifications to users whenever there is a change in their schedule.
- **Customizable notifications**: Users can choose which types of events they want to be notified about and how they want to receive the notifications (e.g., Discord Webhooks, Slack Webhooks).

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
   npm install node-fetch webuntis path express date-fns ejs
   ```
3. Set up the configuration file: 
   - Copy the `secretsExample.js` file and rename it to `secrets.js`.
   - Fill in the necessary information, such as your Untis credentials and notification settings.
4. Run the application:
   ```bash
   node index.js
   ```

## Usage:
- The system monitors Untis automatically for changes in exams, homework, absences, and timetable changes every 10 minutes.
- There is a debug web interface at `http://localhost:3000` which should not (yet) be exposed to the internet.
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