# XPG Maintenance Rotation

Google Apps Script automation for the maintenance rotation spreadsheet.
The code lives in `src/` and is synced to a spreadsheet's script with [clasp](https://github.com/google/clasp).

## Prerequisites

- Node.js 18+
- Apps Script API enabled for your Google account: https://script.google.com/home/usersettings (toggle **Google Apps Script API** on)

```sh
npm install
npm run login        # opens a browser to authorize clasp with your Google account
```

## Use it in your own spreadsheet

1. Create (or open) your spreadsheet and go to **Extensions → Apps Script**. This creates a script bound to the sheet.
2. In the Apps Script editor, open **Project Settings** and copy the **Script ID**.
3. Point this repo at your script:
   ```sh
   cp .clasp.json.example .clasp.json
   # paste your Script ID into .clasp.json
   ```
4. Push the code:
   ```sh
   npm run push       # add -- --force if it asks about overwriting the manifest
   ```
5. Reload the spreadsheet. Authorize the script the first time you run something.

`.clasp.json` is gitignored because each person points it at their own spreadsheet.

## Day-to-day

| Command | What it does |
| --- | --- |
| `npm run pull` | Download the script's current code into `src/` |
| `npm run push` | Upload `src/` to the script (overwrites the online code) |
| `npm run watch` | Push automatically on every save |
| `npm run open` | Open the script in the Apps Script editor |

Workflow: edit in `src/`, `npm run push`, test in the sheet, commit.
If you edited in the online editor, run `npm run pull` first so you don't overwrite those changes.
