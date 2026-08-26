# MWA Analytics Dashboard 4.3

Moodle block plugin for teachers to monitor student engagement, participation, activity completion, resource access, grades, alerts, pedagogical interventions, and follow-up outcomes within Moodle.

## Requirements

| Item | Requirement |
| --- | --- |
| Moodle | 4.1 or later |
| PHP | 7.4 or later |
| Plugin type | Block |
| Component | `block_mwa_dashboard` |
| Current release | **4.3** |

## Installation

1. Go to **Site administration → Plugins → Install plugins**.
2. Upload the plugin ZIP file and complete Moodle's validation.
3. Add the **MWA Analytics Dashboard** block to a course.
4. Turn editing on and configure the block.
5. Select **Enable event capture in this course** and save.
6. Open the dashboard from the block.

Course data is refreshed whenever the dashboard is opened. Event capture is disabled by default, including after an upgrade, and must be enabled explicitly in every intended course. Hiding the block does not disable capture; clear the setting or remove the block to stop new collection.

All core dashboard features work without an external AI provider.

## Dashboard areas

### Action Center

Summarises the class, presents the main KPIs, identifies priorities, and provides direct access to students, activities, alerts, and intervention workflows.

### Alerts

Highlights students with no recorded access, viewed-but-not-submitted activities, sudden engagement drops, symbolic access, and reactivation. Alert KPIs share a consistent layout and terminology across the dashboard.

### Class List

Displays participation, student identity and presence, one consolidated situation, graded-activity progress, content/resource progress, current grade, and total time. Selecting a student opens a screen overlay with KPIs, activity and resource indicators, reports, recommendations, and messaging actions without expanding the table. The list and detail views are responsive at browser zoom levels.

### Student Profile

Provides an individual view with presence, last access, active days, grade, engagement, activity and resource progress, recent activity, access timeline, daily journey, calendar, notes, and message history. Engagement uses a single situation and includes its reason icons when the student is in follow-up.

### Activities / Resources

Analyses Moodle course modules using course-module IDs. It separates completion or submission from access coverage, displays deadlines and affected students, supports independent tracked and untracked lists, and allows teachers to hide tracked items from the main view without removing them from calculations. The spreadsheet export retains complete activity/resource information.

### Grades

Shows approved, in-progress, and no-grade populations, distribution, filters, dynamic approval targets, and spreadsheet export. Selecting a student opens a wide academic detail panel with grade KPIs, released and pending grades, progress, attention items, an approval projection, activity status, and contextual actions. Calculations follow the complete maximum of currently monitored graded activities.

### Access Heatmap

Shows access distribution by day and hour with period, student, resource, and visualisation filters, plus access-pattern insights and suggested intervention windows.

### Interventions

Records pedagogical actions with period, reason, teacher, student, and status filters. Selecting a record opens its complete details in a screen overlay with the message, tracked items, intervention snapshot, follow-up progression, and notes. Spreadsheet export is also available.

### Follow-up Report

Consolidates intervention and subsequent Moodle evidence in Overview, Engagement, Learning, Interaction, Permanence, Mediation, Trajectory, and AI Report sections.

### Chat with Class

Optional AI assistant for questions about class priorities, activities, communication, and engagement patterns. Individual identities are pseudonymised before external processing.

## Participation and follow-up

Participation considers content access, completion or submission, grades, active days, and relevant Moodle interaction evidence.

| Range | Situation |
| --- | --- |
| 0% | No recorded access |
| 1%–40% | Beginning the pathway |
| 41%–69% | Progressing |
| 70% or more | Consistent pathway |

Follow-up is presented as one situation and may contain reason indicators for an overdue submission, seven days or more without participation, or partial achievement below 60%. Students with no recorded access remain in their own situation instead of appearing simultaneously in follow-up.

## Activity and grade conventions

- Green indicates completed, submitted, accessed, or a released grade.
- Blue indicates an available open item that is still pending.
- Red is reserved for an overdue graded activity without submission or grade.
- Future, restricted, closed, or untracked items do not distort the current denominator.
- A numeric zero is treated as a valid released grade, not as a missing grade.
- Singular and plural labels adapt to the displayed KPI count.

## Optional AI configuration

1. Go to **Site administration → Plugins → Blocks → MWA Dashboard settings**.
2. Enable AI features.
3. Select DeepSeek, OpenAI, Google Gemini, Anthropic, OpenRouter, or an institutional provider.
4. Save the credential obtained directly from that provider.
5. Test the connection.

The plugin connects directly from the Moodle server to the configured provider. It applies capability and opt-in checks, data minimisation, field allowlisting, pseudonymisation of individual records, aggregate-only class context where appropriate, and a final filter for email addresses, IP addresses, enrolment identifiers, and submission content. Credentials are not exposed to dashboard JavaScript.

## Version 4.3 highlights

Version 4.3 delivers the current unified dashboard experience for course monitoring, student follow-up, academic performance, intervention management, and optional privacy-safe AI support.

### Unified interface

- KPI titles use consistent black typography while icons, values, trends, and status accents retain their semantic colours.
- Filters use the same custom dropdown behaviour, visual hierarchy, spacing, and sentence-case labels.
- Cards, legends, pagination, page-size controls, action buttons, and close controls follow one shared visual pattern.
- The layout uses the available screen width and remains usable at common browser zoom levels and responsive breakpoints.
- The dashboard logo returns to the Action Center, scrolls to the top, and refreshes current Moodle data.
- The Action Center greeting automatically includes the current course name, and the return-to-course action is positioned at the right side of the header.

### Student navigation and Class List

- Each learner has one situation: no recorded access, beginning the pathway, progressing, in follow-up, or consistent pathway.
- Follow-up reasons identify overdue delivery, prolonged inactivity, and partial achievement below 60% without creating duplicate situations.
- Selecting a learner opens a suspended detail card with avatar, identity, access, active days, interactions, grade, activities, resources, AI recommendation, messaging, and close actions.
- **View individual profile** closes the card, opens Student Profile, and preselects the correct learner.
- Student Profile search remains editable after a match, supports Backspace/Delete and clear, and does not reopen old suggestions after navigation.
- The Evolution Report action appears only for learners with a registered intervention.
- Class List pagination includes an items-per-page selector and spreadsheet export.

### Activities and resources

- Suspended details separate completion rate, access coverage, deadline, delivered or posted students, viewed-but-not-submitted students, and students without access.
- Deadline content is vertically centred and distinguishes finalised, open, finalises today, and no-deadline states.
- Compact accordions use sentence case, close when selected again, and reveal affected learners without expanding the main list.
- Thin progress bars and compact status labels avoid oversized visual elements.
- Tracked and untracked items remain separate; hidden tracked items can be restored without changing calculations.
- Spreadsheet export includes the complete tracked analysis and preserves accented Portuguese text.

### Grades

- Approved, in-progress, and no-grade learners share one unified, paginated performance list controlled by KPI filters.
- The suspended academic card contains current grade, approval target, missing points, released grades, progress, attention items, approval projection, and every graded activity.
- The progress bar is integrated into the Progress KPI and respects the actual monitored maximum.
- A numeric zero remains a released grade; empty values remain pending or without grade.
- **Evolution report**, when available, appears in the header immediately before **View individual profile**.
- **View individual profile** opens the selected learner directly.
- Messaging remains available in the lower action area.

### Interventions and follow-up

- Intervention records open in suspended cards with student, teacher, reason, status, message, tracked items, historical snapshot, and teacher notes.
- **View individual profile** appears beside **Initial record** at the top of the intervention content.
- Messaging and close actions remain aligned in the lower action area, with no unnecessary separator line.
- Delete is directly available where applicable; obsolete ellipsis menus and duplicate message actions were removed.
- Filters cover period, reason, status, teacher, and learner using the shared dropdown design.
- Follow-up and intervention-reason KPI titles share the same font, size, weight, and colour rules.

### Alerts, Heatmap, and Action Center

- Alert KPIs evenly fill the row and begin with **No recorded access**.
- Alert, Class List, Intervention, Heatmap, and Follow-up KPI titles use the same black typography.
- Heatmap KPI labels use sentence case: **Peak hour**, **Filtered accesses**, and **Total logs**.
- Action Center cards link directly to the relevant filtered learner or activity population.
- The urgent card describes enrolled students who have not yet recorded Moodle access.

### Optional AI and privacy

- Core analytics work without an AI provider.
- Individual data sent externally is pseudonymised and filtered server-side.
- Returned aliases are restored to the real Moodle display name, so recommendations and suggested messages do not expose labels such as `Student-009` to teachers.
- A failed recommendation can be retried without leaving the learner card locked.
- Class-level requests use aggregate context where appropriate, and restricted assessment content remains inside Moodle.

### Exports and compatibility

- Spreadsheet export is available for Class List, Grades, Interventions, and Activities / Resources.
- Moodle 4.1 or later and PHP 7.4 or later are supported.
- Plugin component: `block_mwa_dashboard`.
- Moodle's native `core/chartjs` module is used; no bundled Chart.js vendor directory is included.
- Suspended Class List and Intervention shells use Moodle Mustache templates.
- User-facing strings use Moodle's language system, and production AMD files are compiled from matching source modules.

## Author

**Bruno Porto**  
Professor and Researcher — IFES/CEFOR  
Espírito Santo, Brazil — 2026
