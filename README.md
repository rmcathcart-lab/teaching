# Teaching Hub

Mr. Cathcart's universal settings and the view across every class: https://rmcathcart-lab.github.io/teaching/

| Part | Where | What it does |
|---|---|---|
| **Today** | `#/today` | Every block's class and lesson for a day (‹ › to look ahead), with links to each Teacher Ledger and lesson page |
| **Calendar** | `#/calendar` | The universal calendar: every class's calendar for a semester on one page, one row per block in each day's bell order |
| **Schedule** | `#/schedule` | Semesters: which course is in which block. Saving makes any new classes in each course's ledger |
| **Sub plans** | `#/subs/<date>` | A full day's plans for a substitute, editable on the page, downloaded as a Word file |
| **Settings** | `#/settings` | Bell times, days off, sub-plan details, course sign-ins, the universal bookmark |
| **Universal bookmark** | `/teaching/go/` | During a class: that class's Teacher Ledger. Any other time: the class taught last |

## How it fits with the course sites

All the course sites live at the same web address (rmcathcart-lab.github.io), so the hub can work with them directly:

- **`js/courses.js` is the one shared course list.** Every Teacher Ledger (math10c, math15, robotics) loads it from here
  (`../../teaching/js/courses.js`) for the course switcher (the badge in a ledger's corner): *This semester* (from the
  schedule, with a button per block), *Other courses*, and *All classes* / *Universal settings*. To add a course, add a
  line to `COURSES` there and give the course a `teacher/bridge.html` (see below).
- **Each course has a bridge** (`<course>/teacher/bridge.html` + `bridge.js`). The hub opens it in a hidden frame and
  calls `window.COURSE_BRIDGE`: list classes, read and change a class calendar, make a class, set a block, send days off
  and bell times, and gather a day's sub-plan details. Everything goes through that course's own Apps Script backend
  with its own teacher key, so **each class calendar has one copy**: a change in the universal calendar is a change to
  the class's calendar (its ledger and its students see it), and a change in a ledger shows up in the hub (it reads the
  calendars again whenever you come back to the tab). The math bridge is the same file in math10c and math15.
- **Bell times and days off** are set here and sent to every course's backend (`setbell`, `setnoschool`), which still
  uses its own copy for class time and calendar layout. The hub checks each time it opens and sends them again if a
  course has a different copy. The ledgers no longer edit them (their Settings and Calendar tabs link here).
- **Blocks (class time)** follow the schedule: the semester that's on now gives each of its classes its block. The hub
  and each math ledger apply this when they open; a class from another semester that still holds the block gives it up.
  Classes the schedule doesn't mention are left alone.
- **Course keys.** The first time the hub sees a ledger signed in on a device it keeps that ledger's key, and on another
  device it signs the ledgers in for you. Robotics classes don't track class time, so their block is only in the schedule.

## Backend

`backend/Code.gs` is a small Apps Script web app (Execute as: me · Who has access: Anyone) that stores the settings as
script properties: BELL, NOSCHOOL, SEMESTERS, SUB, KEYS. Nothing about students is stored here.

1. Make a new Apps Script project in the school account, paste `backend/Code.gs`, and run `setup()` once. It logs the
   teacher key (also under Project Settings → Script properties → TEACHER_KEY).
2. Deploy → New deployment → Web app (Execute as: me · Who has access: Anyone).
3. Put the `/exec` URL in `js/courses.js` (`BACKEND`) and push.

Until then (`BACKEND` empty) the hub keeps its settings in the browser on that device, and still sends bell times and days
off to every course. Once the backend is set, settings made on-device can be entered again in the hub (they aren't copied
automatically).

After changing `Code.gs`, deploy a **new version of the same deployment** so the URL stays the same.

## Files

| Path | What it is |
|---|---|
| `js/courses.js` | Shared by every site: course list, the hub's settings (cached on the device as `teach/hub`), bell schedule and semester logic (`TEACH.target` = the class on now or taught last), the course switcher |
| `js/hub.js` | The hub: settings store, course bridges, Today, Schedule, Settings |
| `js/ucal.js` | The universal calendar (drag math lessons, tap for options, robotics mission lengths, days off) |
| `js/subplan.js` | Sub plans and the Word file (`assets/vendor/docx.js`, the docx library, MIT, loaded only when downloading) |
| `go/index.html` | The universal bookmark. `?show=1&at=2026-11-05T13:00` shows where it would go at that time |
| `backend/Code.gs`, `backend/mock_server.js` | The Apps Script backend, and a local stand-in for tests (teacher key `teachkey`) |

**Publishing:** GitHub Pages builds from the `gh-pages` branch, so push `main` to both: `git push origin main main:gh-pages`.

## Sub plans

Pick a day; the hub writes one section per class from that day's calendar: the lesson (with the lesson page to project,
the notes PDF, the option for students to teach themselves from the lesson, the assignment and how to sign in, and whether
calculators are allowed), robotics missions (day N of M, parts, due day), prep and lunch, then the rules and routines and
sign-in help from Settings. Every section can be edited before downloading (edits are kept on that device for that date).
A unit test on that day gets a warning (only the teacher can launch a test) with a button to move it to the next class.
