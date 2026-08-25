# MWA Analytics Dashboard 4.3 — Highlights

Version 4.3 strengthens day-to-day student monitoring with clearer follow-up reasons, dynamic partial-grade calculations, presence indicators, and richer exports.

## Transparent student follow-up

- The Action Center and Class List use the same follow-up population.
- Each student can display **EV** (overdue submission), **7D** (no participation for seven days or more), and **<60** (partial achievement below 60%).
- The Action Center lists only reasons that actually occur, with an independent count for each one.
- Students who reach 60% of the current monitored maximum leave grade-based follow-up.
- Assignment delivery is confirmed from Moodle submission state rather than generic completion.

## Dynamic partial grades

- Approval targets use 60% of the full maximum of the activities currently monitored.
- Excluding or restoring an activity recalculates the maximum, target, missing points, progress bar, cards, charts, and export.
- Progress labels show the real partial scale, such as **30/30**, instead of forcing **30/100**.
- The full monitored maximum is shared by the class, preventing incorrect approvals when students have different quantities of released grades.

## Class List improvements

- The summary table displays the current grade; interactions remain available in the expanded detail and export.
- Follow-up reason badges and their legend use matching language and colours.
- The spreadsheet export includes one named column per graded activity with the student's obtained grade.
- CSV output is Excel-friendly and preserves Portuguese accents.

## Presence estimate

- **Online now** indicates a Moodle action recorded within the last five minutes.
- **Recently active** covers activity between five and fifteen minutes.
- **Offline** is shown after fifteen minutes or when no activity is available.
- Presence appears in the Class List and Student Profile and refreshes every minute while either view is open.

## Action Center consistency

- The navigation badge equals the exact sum of the **Urgent**, **In follow-up**, and **Review** cards.
- Review counts use the same complete activity source as the rendered card.
- Follow-up navigation opens the matching filtered Class List.

## Compatibility

- Moodle 4.1 or later.
- PHP 7.4 or later.
- Plugin component: `block_mwa_dashboard`.
- Moodle's native `core/chartjs` AMD module is used; no bundled Chart.js vendor directory is required.
- Production AMD artifacts are synchronised and minified from their matching source modules.
