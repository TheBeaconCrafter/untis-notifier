# Untis Notifier

A notification system for [WebUntis](https://www.untis.at/) that monitors your school schedule and sends batched Discord notifications when changes are detectet (such as exams, homework, absences, and timetable changes).

## Features

- **Batched Discord notifications**: Multiple changes in a single check cycle are combined into one rich embed message instead of spamming individual pings
- **Group pings**: Ping a Discord role (e.g., `@ClassOf2025`) instead of just a single user
- **SQLite storage**: Reliable local data persistence using SQLite instead of JSON files
- **iCal sync**: Stream your timetable to any calendar app via iCal
- **No exposed ports**: Webhook-based — no need for an outward-facing server

## Requirements

- **Node.js 18+** (tested on v20)
- A Discord Webhook URL
- WebUntis credentials

## Quick Install

```bash
git clone https://github.com/TheBeaconCrafter/untis-notifier.git
cd untis-notifier
chmod +x setup.sh
./setup.sh
```

The script installs dependencies and guides you through creating your `.env` configuration file.

## Manual Install

1. Clone the repository:
   ```bash
   git clone https://github.com/TheBeaconCrafter/untis-notifier.git
   cd untis-notifier
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in your credentials and settings.

4. Run:
   ```bash
   npm start
   ```

## Configuration

All configuration is done via environment variables in the `.env` file. See [`.env.example`](.env.example) for all available options.

### Discord Ping Target

The `DISCORD_PING_TARGET` variable controls who gets pinged:

| Format | Example | Effect |
|--------|---------|--------|
| `user:ID` | `user:123456789012345678` | Pings a specific user |
| `role:ID` | `role:987654321098765432` | Pings a Discord role (group) |
| _(empty)_ | | No ping, just sends the message |

To find a user ID: Enable Developer Mode in Discord → Right-click user → Copy ID.
To find a role ID: Server Settings → Roles → Right-click role → Copy ID.

## iCal Sync

Sync your timetable to your favorite calendar app:

1. In `.env`, set:
   - `ENABLE_WEB_SERVER=true`
   - `ENABLE_ICAL_STREAMING=true`
   - `WEB_SERVER_PORT=3000` (or any open port)

2. Optionally enable `DISABLE_ROUTES_EXCEPT_ICAL=true` for production security

3. Your calendar will be available at `http://YOUR_SERVER:PORT/timetable.ics` (or the custom name you configured in `ICAL_FILE_NAME`).

## Console Commands

When running, type commands in the console:

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `status` | Show current scanning status |
| `cacheall` | Force check all scanners now |
| `timetable` | Force timetable check |
| `exams` | Force exam check |
| `homework` | Force homework check |
| `absences` | Force absence check |
| `toggleroutes` | Toggle web routes on/off |
| `exit` | Stop the application |

## Deployment (PM2)

For a production environment, it is recommended to run the app using PM2 to ensure it stays online in the background and restarts automatically on failure.

1. Install PM2 globally: `npm install -g pm2`
2. Start the application: `pm2 start ecosystem.config.cjs`
3. View logs: `pm2 logs untis-notifier`
4. Setup PM2 to start on boot: `pm2 startup` and `pm2 save`

## Running Tests

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License. See the [`LICENSE.md`](LICENSE.md) file for more information.
