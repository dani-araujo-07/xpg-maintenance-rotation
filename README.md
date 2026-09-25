# Maintenance Rotation

Google Apps Script bound to a spreadsheet. It pairs one backend and one frontend engineer on rotations (2 weeks by default), posts Slack handover and reminder messages, archives finished rotations, and keeps the schedule topped up.

The code lives in this repo and is deployed to one spreadsheet per team. Everything team-specific (settings, message wording, engineers) lives in that team's spreadsheet.

| Sheet | Contents |
| --- | --- |
| Engineers | Name, Area (`Backend` / `Frontend`), Slack User ID |
| Rotation Schedule | Row 2 is the current rotation, rows below are upcoming. Written by the script; names can be swapped by hand |
| Archive | Finished rotations, written by the script |
| Config | Channels, days, hours, rotation length |
| Messages | Wording of the Slack messages, with placeholders |

The Slack token and the round-robin position are stored in Script Properties, not in the sheet.

Scheduled runs, in the script's timezone:

- **ROTATION_DAY at ARCHIVE_HOUR**: archive finished rotations and top up the schedule
- **ROTATION_DAY at ROTATION_START_HOUR**: post the handover message
- **REMINDER_DAY at REMINDER_HOUR**: post the reminder for the upcoming change

## Prerequisites

- Node.js 18+
- **Google Apps Script API** turned on at https://script.google.com/home/usersettings
- Edit access to the team's spreadsheet

```sh
npm install
npm run login
```

## Adding a team

1. Create a new spreadsheet and open **Extensions → Apps Script**. This creates the script bound to the sheet.
2. In the Apps Script editor, copy the **Script ID** from **Project Settings**.
3. Add the team to [deploy/teams.json](deploy/teams.json), commit, and deploy:
   ```json
   "my-team": { "name": "My Team", "scriptId": "…", "timeZone": "Europe/Berlin" }
   ```
   ```sh
   npm run deploy -- my-team
   ```
4. Reload the spreadsheet. The **Rotation** menu appears a few seconds after it opens.
5. **Rotation → Set up sheets**. Google asks you to authorize the script the first time.
6. Set the spreadsheet timezone (**File → Settings**) to the `timeZone` from `teams.json`.
7. **Engineers**: one row per person, with Area `Backend` or `Frontend`. To get a Slack User ID, open the person's Slack profile, click ⋮ and choose **Copy member ID**. The order of the rows is the rotation order.
8. **Config**: fill in at least `SLACK_CHANNEL`, `FIRST_ROTATION_DATE` (the first rotation's start date, on `ROTATION_DAY`) and, if you use it, `BUGS_CHANNEL_ID`. Setting `TEST_CHANNEL` enables previews.
9. **Messages**: adjust the wording if you want. Clearing a row leaves that part out.
10. **Rotation → Set Slack token**, then invite the bot to `SLACK_CHANNEL` and `TEST_CHANNEL`.
11. **Rotation → Check setup** and fix any errors.
12. **Rotation → Regenerate schedule** to create the first rotations.
13. **Rotation → Send message previews** to check the messages in `TEST_CHANNEL`.
14. **Rotation → Install triggers**. The scheduled runs run as your Google account, so this should be someone who stays on the team. If they leave, someone else runs it again.

## Deploying changes

```sh
npm run deploy -- my-team                # one team
npm run deploy -- my-team other-team     # several
npm run deploy -- --all                  # every team in deploy/teams.json
npm run deploy -- my-team --dry-run      # build and list files, push nothing
```

For each team, the deploy script copies `src/` to `.build/<team>/`, sets the team's timezone in `appsscript.json`, writes `Version.js` with the commit, and pushes with clasp. A push replaces all code in that script, so edits made in the online editor are lost.

It refuses to deploy uncommitted changes in `src/` or `deploy/`. `--allow-dirty` overrides this, and the version then shows `-dirty`. **Rotation → Check setup** shows which commit is live in a sheet.

Suggested flow for a change: commit it, deploy to one team, check its sheet (Check setup and Send message previews), then deploy with `--all`.

## Day to day

- **Swapping people** (holidays and similar): edit the names in Rotation Schedule. Use the exact names from Engineers. Once a swapped rotation is archived, rotations generated after that continue the order from the person who was swapped in.
- **Adding or removing an engineer**: edit Engineers. Only rotations generated from then on are affected, and existing rows stay as they are.
- **Changing days or hours** in Config: run **Install triggers** again afterwards.
- **Something looks wrong**: run **Check setup** first. Failed Slack messages make the scheduled run fail, and Google emails the person who installed the triggers.

| Menu item | What it does |
| --- | --- |
| Check setup | Checks settings, Slack, timezone, engineers, schedule, messages, triggers, and shows the deployed version |
| Top up schedule now | Archives finished rotations and adds new ones, like the scheduled archive run |
| Send message previews | Posts the next reminder and handover to `TEST_CHANNEL`, with names instead of @-mentions |
| Set Slack token | Saves the bot token and checks it with Slack |
| Install triggers | (Re)creates the scheduled runs under your account |
| Set up sheets | Creates missing sheets and adds new settings and messages, keeping your values |
| Regenerate schedule | Replaces all upcoming rotations, including swaps, continuing from the archive |

## Code layout

| File | Purpose |
| --- | --- |
| `Constants.js` | Sheet names, column positions, Script Property keys |
| `Config.js` | Config sheet: settings, defaults, parsing, `setupConfigSheet()` |
| `Messages.js` | Messages sheet: default wording, placeholders, `setupMessagesSheet()` |
| `Rotation.js` | Round-robin generation, archiving, lookups (`maintainRotation()`) |
| `Notifications.js` | Handover and reminder messages |
| `Validate.js` | `validateSetup()`, behind **Check setup** |
| `Menu.js` | The **Rotation** menu |
| `Setup.js`, `Sheets.js`, `Triggers.js` | Sheet creation, Slack token, sheet helpers, triggers |
| `Debug.js` | Read-only helpers for the editor (`inspect()`, `debugEngineersList()`), and `previewMessages()` |
