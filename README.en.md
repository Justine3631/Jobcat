# Jobcat · Personal Job Search Workspace

[简体中文](README.md) | **English**

Keep job links, assessments, resume versions, conversations, and interviews together. Jobcat runs on your computer and stores your workspace in a local SQLite database. Use a separate AI assistant to research and analyze opportunities; no API key is required by Jobcat.

Each installation has its own workspace. Sharing the source code does not share your job records.

> The application UI is currently Chinese. The language links switch documentation only; an English UI is not implemented. Jobcat is not a job board and does not include an AI backend or automatic applications.

## Features

- **Opportunities:** employer, title, location, salary, original links, JD history, and information completeness.
- **Progress:** personal decisions, application stages, weekly focus, next actions, and due dates. Deferred jobs move to a separate follow-up view and return to the opportunity library when resumed. Deferred or declined jobs stop daily action prompts while existing interviews remain visible.
- **History:** conversations, actual applications, interview rounds, offers, and linked material versions.
- **AI collaboration:** saved search briefs, context export, and previewed JSON analysis imports. AI advice is separate from your decisions.
- **Portable data:** full JSON backup and restore, plus fictional demo data isolated from your real workspace.
- **Desktop web:** desktop browsers are the current verification priority. Cross-device access and sync are not configured.

## Quick start

Install **Python 3.10+** and use a modern browser. No third-party Python packages, Node.js, or database server are needed to run the app. Node.js is only needed for development tests.

### Download

Choose **Code → Download ZIP** on GitHub and extract it to a permanent folder, or clone:

```sh
git clone https://github.com/Justine3631/Jobcat.git
cd Jobcat
```

### Run

macOS / Linux:

```sh
python3 launcher.py
```

Windows:

```powershell
py -3 launcher.py
```

The launcher opens **http://127.0.0.1:8769** and reuses an existing instance on that port. On macOS, you can also double-click `启动 Jobcat.command`. Start again after rebooting. Closing the browser does not stop the background server.

To start without opening a browser: `python3 launcher.py --no-browser`.

For a foreground server that you can stop with Ctrl+C:

```sh
python3 server.py
```

Use either the launcher or the foreground server, not both on the same port. Launcher logs are stored in `data/server.log`. If the port is occupied, run `python3 server.py --port 8770` and open the matching URL. The launcher always uses port 8769.

## First use

1. Open **偏好与数据** (Preferences & data) and enter your own target roles, cities, and salary preferences. A fresh installation contains no real jobs, resumes, or personal preferences.
2. Try **虚构示例** (Fictional demo), then exit it to return to your real workspace.
3. Use **机会库 → 添加机会** (Opportunities → Add) to save a job. A title or JD is enough to start.
4. For AI help, save criteria under **找机会** (Find opportunities), then use **复制给当前聊天** (Copy to current chat) and send it to your own assistant. Saving a brief does not start a search.
5. Record your decisions, next actions, materials, conversations, and interviews. Log an application only after you actually submit it.

Archiving stores a job without removing its history. Archived jobs participate in duplicate checks and historical application/interview metrics.

## Resume editor and PDF

Import your own DOCX template (up to 10 MB), duplicate it, edit its text slots, and optionally link it to a job. After you pause typing, the editor generates a preview of the actual PDF. Save text to persist a version, or download the PDF. Previewing does not overwrite saved text. The master is read-only in the UI. Downloading saves and exports a snapshot of the content at the time you clicked. Edits typed during export remain in the form and are marked unsaved. Changes to text or the template invalidate and refresh the old preview. Longer text may add pages; fonts are not automatically shrunk.

The resume list supports search by name, company, or role and filters for drafts, master templates, submitted originals, and archived drafts. Job details link directly to their resumes. The editor uses a fixed-height two-column workspace: the left editor scrolls internally above a compact action bar, while the right PDF preview scrolls independently. The page itself stays still.

After confirming an application was actually sent, register its submitted PDF. Originals are read-only; create a separate follow-up draft for later edits. Applications without a confirmed file show a missing-original entry; adding the file does not create another application. Explicit full-backup restoration can restore originals, while ordinary edits cannot overwrite or delete them.

PDF generation requires local LibreOffice (`soffice`, or an executable specified by `JOBCAT_SOFFICE`) and the template's fonts. Missing fonts can change the layout. Conversion stays on your computer. The bundled PDF.js renders the PDF pages; its license is in `web/vendor/pdfjs/LICENSE`. Templates and resume versions are included in private workspace backups, not in the public source repository.

## Working with AI

The website does not search job boards or call models itself. You need a separate assistant with suitable web or file tools. Tool availability, authentication, and platform access depend on that assistant.

- **File workflow:** export selected job context, ask the assistant for an analysis JSON draft, then preview and import it into Jobcat.
- **Local agent workflow:** an authorized assistant with tools on your computer can read and update `/api/state`. A normal cloud chat cannot access your computer just from a localhost URL.
- Refresh or use the update notice to see new results. AI advice does not set your personal decision or submit applications.

See the [AI collaboration format and write contract](docs/AI_COLLABORATION.md) (detailed examples in Chinese). Complete any required login or human verification yourself on the official job site. Confirm current availability, compensation, and the legal employer separately.

## Data and privacy

- `data/jobcat.sqlite3` is created on first use. Attachments are stored in the database too. The app does not automatically upload them to the cloud.
- Export a full backup from Preferences & data. It contains records and attachments, so treat it as personal information and do not include it when sharing code.
- To migrate, export a backup, start Jobcat on the new computer, and restore it. Restore replaces the workspace: review the preview and keep the downloaded pre-restore backup.
- The database retains the last 10 pre-write snapshots. These are on the same computer and do not replace independent backups.
- Do not delete `data/`. Clearing browser storage does not remove the database. Each attachment is limited to 10 MB; workspace write requests are limited to 64 MB.
- The server listens on `127.0.0.1` and has no multi-user authentication. Do not expose it directly to the internet or use it as a shared server.

The public repository contains generic code, tests, and documentation only. It excludes the author's resumes, job database, research notes, and real screenshots.

## Updates and development

Export a backup before updating. For a Git installation, use `git pull` after resolving any local code changes. For ZIP downloads, extract the new version into another folder and copy your old `data/` there, or restore a full backup. Restart the server afterward. Preserve your data directory.

`web/` contains the vanilla HTML/CSS/JavaScript front end; `server.py` provides the Python HTTP server and SQLite storage; `launcher.py` starts the app; `tests/` covers model and storage/API behavior.

Development checks require Node.js 18+ and Python 3.10+:

```sh
node --test tests/model.test.mjs
python3 -m unittest discover -s tests
```

Tests use temporary databases, not your real workspace. Desktop use has primarily been verified on macOS; full Windows and Linux desktop testing has not been completed. Report problems in GitHub Issues after removing personal information.
