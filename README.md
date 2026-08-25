# MWA Analytics Dashboard

A Moodle 4.1+ block plugin that gives teachers a comprehensive Learning Analytics dashboard to monitor student engagement, activity completion, content access, grades, alerts, pedagogical interventions, and follow-up outcomes — all within Moodle.

---

## Requirements

| Item | Requirement |
| --- | --- |
| Moodle | 4.1 or later |
| PHP | 7.4 or later |
| Plugin type | Block |
| Component | `block_mwa_dashboard` |
| Current release | **4.3** |

---

## Installation

1. Go to **Site administration → Plugins → Install plugins**.
2. Upload the plugin ZIP file.
3. Confirm the installation after Moodle validates the package.
4. Add the **MWA Analytics Dashboard** block to a course page.
5. Turn editing on, open the block's actions menu, and select **Configure MWA Dashboard block**.
6. Select **Enable event capture in this course** and save the block configuration.
7. Click **Open dashboard**.

Every time the dashboard is opened, course data is refreshed automatically from Moodle.

### Enabling event capture

Event capture is disabled by default, including after upgrading an existing installation. In each course where collection is required, edit the MWA Dashboard block, select **Enable event capture in this course**, and save the block configuration.

Hiding the block does not disable collection. Clear the checkbox or remove the block to stop event capture for the course.

> **All core features work immediately after installation — no AI configuration needed.**

---

## Configuring Optional AI Features

AI features are entirely optional and disabled by default. To enable them:

1. Go to **Site administration → Plugins → Blocks → MWA Dashboard settings**.
2. Click **Open MWA Dashboard settings**.
3. Tick **Enable AI features**.
4. Select an **AI provider** (DeepSeek, OpenAI, Google Gemini, Anthropic, OpenRouter, or Institutional).
5. Save and enter the **credential obtained directly from your chosen provider**.
6. Click **Test connection** to confirm the setup.

> MWA does not sell, provide or require any licence, activation code or commercial key. Credentials are obtained directly from the external provider and stored only on your Moodle server.

---

## Optional AI Integrations

MWA is **fully functional without any external AI service**. All core features — dashboard, analytics, grades, alerts, interventions, class list, student profiles, heatmaps, activities, and follow-up reports — work without a provider or credential.

When AI is enabled, the plugin connects directly from the Moodle server to the selected provider — **there is no MWA intermediary server**. Before any external transmission, MWA applies:

- Capability and opt-in checks.
- Server-side data minimisation and field allowlisting.
- Pseudonymisation of individual student records (aliases replace real names).
- Aggregate-only context for the class chat (no per-student identifiers).
- A final transport filter that removes email addresses, IP addresses, enrolment identifiers and submission content.

Aliases are restored to display names locally after the AI response is received. The credential never appears in dashboard JavaScript.

---

## Dashboard Tabs

### Action Center
Teacher's starting point. Summarises the class and highlights priorities: active students, students in follow-up, low-coverage activities, best communication window, and quick navigation cards to any dashboard area.

### Alerts
Identifies behavioural patterns requiring attention: never accessed, viewed but not submitted, sudden engagement drop, early disappearance, symbolic access, and reactivation.

### Class
Main student monitoring area. Lists students with engagement, pathway and follow-up labels, exact follow-up reason badges, graded-activity and content/resource progress, current grade, estimated presence, time totals, and expandable detail with interactions, reports, recommendations, and message actions.

### Student Profile
Detailed view of a single student: estimated presence, last access, active days, grade, engagement score, activity and content progress, last-7-days activity, access timeline, daily journey, activity calendar, private notes, and message history.

### Access Heatmap
Access distribution by day and hour, with period, student, and resource filters, dropout visualisation mode, best intervention window suggestion, and automatic access-pattern insights.

### Activities / Resources
Activity and resource analysis in one place. Lists and tracks Moodle course modules by course-module ID, including standard activities, resources, and common contributed plugins such as attendance, board, questionnaire, games, VPL, journal, group choice, and virtual classroom tools. Each card distinguishes submission/posting from access, shows completion rate, access coverage, deadlines, students without access, expandable student lists, time per student, and AI-generated pedagogical suggestions.

### Grades
Class grade overview with approved/in-progress/no-grade KPIs, grade distribution chart, filters, and spreadsheet export. Approval target, missing points, progress bars, and partial scale follow the full maximum of the activities currently monitored.

### Chat with Class
AI assistant with the full class context loaded. Supports questions about priority students, blocking activities, messages to send, content reinforcement, and engagement patterns. Individual student metrics are pseudonymised before the request reaches the provider.

### Interventions
Records and tracks all pedagogical messages sent from the dashboard. Includes reason cards with counts, period summary, filters, intervention table with snapshots, follow-up status progression, and per-intervention notes.

### Follow-up Report
Eight analysis tabs — Overview, Engagement, Learning, Interaction, Permanence, Mediation, Trajectory, and AI Report — that consolidate intervention snapshots with subsequent Moodle data to measure pedagogical impact.

---

## Participation Logic

The pathway stage is based on pedagogical signals, not only page clicks. The score considers content access, activity completion or submission, grades, active days, native Moodle evidence, and relevant interactions across forums, quizzes, H5P, assignments, and other evaluated modules.

| Range | Label |
| --- | --- |
| 0 % | No recorded access |
| 1 %–40 % | Beginning the pathway |
| 41 %–69 % | Progressing |
| 70 % or more | High participation |

---

## Version 4.3 Highlights

Version 4.3 makes follow-up reasons explicit and aligns the Action Center, Class List, Student Profile, Grades, and exports. Students can be marked with **EV** for an overdue submission, **7D** for seven days or more without participation, and **<60** for partial achievement below 60%. Only reasons that actually occur are shown in the Action Center summary.

Partial grades use 60% of the full maximum of all currently monitored activities. When an activity is excluded or restored, the maximum, target, missing points, progress bar, charts, status cards, and exports follow the new scale. A maximum of 30 therefore displays a target of 18 and progress such as **30/30**; restoring a 100-point set returns the target to 60.

The Class List now shows the current grade and a presence estimate: **Online now** for an action in the last five minutes, **Recently active** for five to fifteen minutes, and **Offline** afterward. The same indicator appears in Student Profile and refreshes every minute while either view is open.

Class List exports include real activity names and each student's obtained grade, preserve accented text in Excel, and retain interaction data. Assignment delivery uses Moodle's current submission state, and the Action Center navigation badge equals the exact sum of its three numeric cards.

See [HIGHLIGHTS.md](HIGHLIGHTS.md) for the concise release summary.

---

## Version 4.2 Highlights

### Final 4.2 consistency update

The final 4.2 package aligns the Action Center, Class List, Grades, Activities / Resources, Student Profile, and dashboard KPIs around the same Moodle-native data. Dependent views refresh automatically after an activity is excluded from or restored to tracking.

The **In follow-up** population now consistently excludes students with no recorded Moodle access and students who have already reached the course approval threshold. Entry remains based on an overdue unsubmitted activity within the actionable window, at least seven days without participation while content is available, or a released partial result below 60%. Students without a released grade remain visible in the appropriate below-threshold views only after Moodle access is confirmed.

Pathway stage and pedagogical follow-up are displayed as independent stacked labels in the Class List and Student Profile. The official palette is shared across both views, while the expanded student detail keeps only actionable indicators and places the preferred study period first.

The **Review** card now consumes the exact same open-item list as the **Low** Activities / Resources filter. Every open item labelled **Low reach** or **Low delivery** is counted once, while closed, future, and untracked items remain excluded.

KPI calculations now use live values instead of loading placeholders, including interaction averages and follow-up totals. Grade lists distinguish zero from no grade, exclude confirmed never-accessed students from **No grade**, and keep the below-60% filter consistent with the course total and released partial grades.

### Native, retroactive first-access detection

The dashboard now reads Moodle's lightweight course last-access record in one bulk query. This identifies students shown as **Never** on the Participants page even when the plugin's event collection was enabled after enrolment, without importing the complete historical log.

The **Urgent** card, **Alerts**, and **Class List** use the same final rule: an active user with the student role is classified as never accessed only when Moodle has no course last-access record and the dashboard has no interaction for that student. Grades are deliberately excluded because a zero or another value may be entered manually and does not prove that the student accessed the course.

### Pathway-stage language and follow-up card

The dashboard now uses a less punitive pathway-stage scale: **No recorded access**, **Beginning the pathway**, **Progressing**, and **High participation**. The former **Attention** student card is now shown as **In follow-up**, with wording that encourages pedagogical verification instead of treating every low score as immediate failure.

The **In follow-up** card is independent from the pathway stage. A student enters it when there is an unsubmitted activity overdue by no more than seven days, seven days without detected participation after the first access while course content is available, or a partial grade below 60%. After the seven-day post-deadline window, the missed submission remains in the academic history but no longer keeps the student in this action card. The partial result uses only activities with a released grade, treats zero as a valid grade, and excludes future or ungraded activities. Pathway KPIs remain **Beginning the pathway** (1%–40%), **Developing** (41%–69%), and **Consistent pathway** (70% or more).

In the Class List and Student Profile progress squares, green means completed/submitted or accessed, blue means an open pending activity or an available resource not yet accessed, and red is reserved for a graded activity whose deadline has passed without submission. The Grades detail follows the same system: green for a released grade (including zero), blue for a pending grade or open activity, and red for an expired activity without submission or grade. Future or restricted items remain hidden and enter the views in blue only after becoming available. The expanded Class List also separates the blue **Pending activities** indicator from the red **Overdue activities** indicator.

Visible legends now accompany the activity and resource squares in Student Profile and the grade squares in the Grades detail modal. The Student Profile engagement label also follows the pathway palette, including blue for **Beginning the pathway**.

The engagement percentage now uses the same currently relevant activity and resource set shown by these progress squares. Future, restricted, closed, or untracked items no longer remain invisibly in the denominator. Consequently, when every currently relevant square is green and participation evidence exists, the displayed progress can correctly reach 100%.

### Native academic evidence in Student/Interaction

The **Student/Interaction** KPI counts students with collected events or native Moodle evidence of an effective submission, finished attempt, forum post, or recorded activity completion. This recovers reliable participation evidence created before plugin collection was enabled without inventing historical event totals. A grade by itself is not treated as interaction evidence, and **Total interactions** continues to report only events actually available to the dashboard.

### Symbolic-access observation window

The **Symbolic access** alert no longer classifies students during the first two calendar days after their first observed event. Starting on the third observed day, it identifies students who remain active on only one or two distinct days, avoiding premature alerts immediately after data collection begins.

### Student-profile search

The **Individual profile** selector card now includes a name-or-email search field and a clear-filters action styled consistently with the Class List. Search narrows the existing student selector without changing the selected profile until the teacher chooses another student.

### Broader Moodle activity and resource coverage

The **Activities / Resources** view now explicitly recognises and links a wider Moodle module set while still using course-module IDs for tracking. Supported modules include files, folders, pages, books, URLs, IMS packages, forums, databases, chat, glossaries, H5P, SCORM, lessons, assignments, quizzes, choices, group choices, feedback, surveys, questionnaires, games, workshops, attendance, boards, journals, VPL, wiki, and virtual classroom modules such as BigBlueButton/Webconf. Unknown real course modules are still listed as trackable resources instead of being silently dropped.

### Forum grade-item de-duplication

Forum-wide gradebook items such as **Global forum grade** are no longer listed as separate dashboard activities. When Moodle exposes more than one grade item for the same course module, the dashboard keeps a single activity based on the course-module ID, preventing duplicate forum rows in the Student Profile, Class List, and grade-based activity indicators.

---

## Version 4.1 Highlights

### Reliable activity percentages

Activity completion, delivery, access coverage, averages, filters, progress rings, and chat snapshots are constrained to the valid 0–100% range. This prevents inconsistent log and active-student populations from producing impossible values such as 1100% or 2000% in the interface.

### Persistent no-grade visibility

The **No grade** KPI remains visible even when its current value is 0%. A numeric grade of zero continues to be treated as a launched grade, while a dash, empty value, or null value is treated as no grade and displayed as an em dash in the student list.

### Clear data-collection guidance

The course block now explains that event collection starts only when capture is enabled and recommends enabling it before the course begins for complete participation data. The guidance appears as an accessible tooltip next to the collection control without changing the lightweight, forward-only collection model.

### Independent activity-list navigation

The tracked activity/resource view and the **Not tracked** area are rendered as separate blocks. Each has its own pagination, current page, item count, and page-size selector, so navigating or changing the quantity in one section never changes the other.

### In-place tracking updates

**Do not track** and **Track again** now update through Moodle's authenticated AJAX service. The activity list refreshes in place, preserves the current page and filters, and moves back only when removing the last item makes the current page cease to exist.

### Visible release information

The dashboard sidebar footer shows the installed **MWA Analytics Dashboard** release in a discreet, support-friendly location. The displayed value comes from Moodle's installed plugin metadata, keeping it aligned with the package release.

### Focused opportunity card

The **Opportunity** card is dedicated exclusively to the class access peak. It shows the detected peak hour, supporting description, hourly mini chart, heatmap action, and scheduling recommendation, without unrelated student avatars or profile lists.

### Stable participant roster and empty states

The active-student KPI is built only from active course enrolments explicitly assigned the standard Moodle `student` role, preventing coordinators, teachers, and managers with overlapping capabilities from appearing as students. The roster remains available even when the course has no usable grade items or collected logs. The average-grade KPI remains visible for a true zero average and shows an em dash when no grade has been entered. Empty Grades and Alerts views use centred icons and concise status text; the Grades view now says **No grades to display** instead of asking for a file upload.

### Valid AMD production artifacts

Modified dashboard modules are compiled and minified from their matching `amd/src` files. Production artifacts for Activities, Action Center, Grades, and the dashboard application satisfy Moodle's AMD build expectations instead of containing unminified source copies.

---

## Version 3.9 Highlights

### Moodle group-aware dashboard

A global group selector now applies the active Moodle course group to logs, grades, students, activities, interventions, follow-up indicators, charts, reports, and exports. In separate-groups mode, teachers without `moodle/site:accessallgroups` can access only their own groups. The selector is hidden when there is no real choice and the single allowed group is applied automatically.

### Group-safe intervention and follow-up reporting

The Interventions and Follow-up Report tabs now pass the selected group to their independent server calls. Follow-up student IDs are validated against current group membership before indicators are calculated, preventing records from another group from appearing in KPIs, charts, individual reports, or PDF exports.

### Redesigned activity and resource overview

The activity list now uses a structured table-style header for completion rate, activity/resource, students with access, access count, access coverage, deadline, and tracking. Status legends, pagination, equal-sized labels, aligned cards, and responsive columns improve scanning at different zoom levels.

### Clear separation between completion and access coverage

Completion and access are now presented as different concepts. Submission-based activities show submitted/posted, viewed-but-not-submitted, and no-access counts. Passive resources focus on accessed versus no access and no longer display a redundant completion card. H5P and game activities follow the same delivery evidence rules as graded tasks, including valid zero-grade submissions.

### Standardised completion and coverage cards

Completion and coverage use matching progress bars, dimensions, thresholds, and labels. Delivery status uses low, satisfactory, and excellent levels; access coverage uses low, satisfactory, and excellent reach. KPI labels and singular/plural wording adapt to the underlying count.

### Interactive activity details

Clicking a KPI opens the corresponding student accordion while preserving the **View names** control. Detail cards include aligned summary KPIs, access/submission lists, time-per-student information, contextual messaging actions, and a consistent AI suggestion area.

### Improved grade analysis

Approved, in-progress, and no-grade sections use aligned columns and consistent headers. **Current grade** was simplified to **Grade**, no-grade indicators are red, and activity-launch counts follow the same warning colour. Grade KPIs and charts use standardised internal number styling.

### Consistent class and student profile UI

Class-list columns no longer wrap at common zoom levels, medium participation is consistently yellow, and expandable student cards place report and collapse controls together. The Student Profile uses matching SVG KPI icons, better content distribution, consistent engagement colours, and cleaned activity tooltips.

### Rich individual evolution reports

The evolution report now provides a formatted analytical narrative instead of only repeating KPIs and charts. It includes issue date, analysed period, recorded interventions, before/after comparisons, observed improvements, stable indicators, points requiring attention, and a causality disclaimer. The PDF layout uses a clean white background.

### Stronger intervention snapshots

Historical snapshots now show consistent KPI rows for activity, access, engagement, enrolment, and overdue-delivery evidence. Academic-pending snapshots include completed activities, pending activities, overdue submissions, and oldest pending age. Snapshot layouts and engagement rings follow the same visual rules as the class list.

### Message and modal consistency

Activity/resource message templates use `{firstname}` for personalised greetings. Message dialogs open above dashboard tooltips and other local layers. Evolution-report, collapse, snapshot, and intervention controls now share consistent sizes, colours, placement, and icon treatment.

### Analytical PDF export

The Follow-up Report PDF includes an issue date, analytical summary, intervention inventory, outcomes, improvements, attention points, and next-step recommendations. Export-only narrative content remains outside the interactive dashboard and appears only when the PDF is generated.

### UI colour and spacing standardisation

KPI numbers, alert panels, participation states, intervention reasons, grade states, cards, filters, headers, badges, and progress bars were harmonised across the dashboard. Excess empty space and redundant nested white backgrounds were reduced while responsive alignment was strengthened.

---

## Version 3.8 Highlights

### OpenRouter provider with dynamic model selection

Administrators can now select OpenRouter as the external AI provider. The configuration page loads the available OpenRouter models from the provider API, shows friendly model names, and stores the internal model identifier required by OpenRouter. A free-model filter helps institutions start with models marked as free while still allowing access to the full catalog when needed.

### Clear Moodle, email, or combined intervention delivery

Intervention sending now respects the selected channel exactly. Moodle delivery creates a private Moodle chat message without triggering email processors. Email delivery uses Moodle's email function explicitly. The combined option sends both the Moodle chat message and the email intentionally.

### Moodle chat messages formatted for students

Messages sent through the Moodle channel are formatted for the message drawer: paragraphs are preserved, repeated AI labels such as `SUBJECT:` and `MESSAGE:` are removed from the body, and tracked items are shown as a clean list. Tracked Moodle activities and resources appear by name, with the link embedded in the item name rather than exposing the raw URL.

### Intervention detail formatting preserved

The intervention detail view now renders message text with the same readable structure used in the original message box. Line breaks and paragraphs are preserved, preventing message bodies from collapsing into a single disorganised block.

### Improved tracked-item follow-up

Tracked items in interventions are evaluated according to the intervention type. Low-participation interventions follow selected Moodle resources and activities through access evidence, while academic-pending interventions focus on graded activities with submission or grade evidence.

### Accurate pending activity lists and completion KPIs

Academic-pending messages now list every graded activity that is still pending for the selected student. Activity completion counters no longer treat a zero grade as completed: forums require participation, and other graded activities require access/submission evidence or a positive grade. The same rule is used by the student indicators and the teacher follow-up KPI.

### Per-course activity tracking

Editing teachers and managers can exclude individual activities or resources from dashboard tracking and restore them later. Excluded items remain visible in a separate list but do not affect student progress, pending-item lists, messages, or activity and resource KPIs.

### In-block data collection switch

Course data collection can now be toggled directly from the MWA block with an on/off switch. The block visibly indicates whether collection is active, making the course-level capture state easier to understand without opening the block configuration form.

### Explicit opt-in for each course

Event capture is now controlled by an explicit checkbox in each block instance: **Enable event capture in this course**. Collection is disabled by default for newly added blocks and for all existing courses after upgrading. This privacy-first behaviour prevents collection from starting merely because the block exists on a course page.

### Lightweight course eligibility lookup

The observer no longer joins `course`, `context`, `block_instances`, and `block_positions` for every eligible event. Course-level consent is stored in the small `block_mwa_dashboard_course` table, where `courseid` is unique, reducing the eligibility check to an indexed lookup.

### Request-level eligibility cache

Repeated events for the same course during one PHP request reuse a static in-process cache. The observer performs at most one eligibility lookup per course in that request, and configuration changes invalidate the cached value immediately.

### Automatic synchronisation with block configuration

Saving the block configuration updates the course capture record. Clearing the checkbox disables new event collection, and removing the block deletes the course authorisation. Hiding the block is intentionally only a visual action and does not disable collection; administrators and teachers must clear the checkbox or remove the block to stop capture.

### Safe upgrade behaviour

The database upgrade creates the course-control table without enabling any existing course automatically. After upgrading, a responsible user must explicitly enable capture in every intended course. Existing analytics records are retained according to the configured retention policy; disabling capture stops new records but does not delete historical data.

### Privacy API coverage for course configuration

The Moodle Privacy API inventory now declares all five internal plugin tables, including `block_mwa_dashboard_course`. The declaration explains that this table stores only the course identifier, enabled state, and modification time, and does not contain user identifiers.

### High-volume observers removed

Four low-value, high-frequency observers were removed: course page views, forum discussion views, assignment submission-status views, and individual H5P xAPI statements. The remaining observers focus on module access, completion, submissions, quiz attempts, forum contributions, SCORM launches, and grading events.

### Smaller retention window and batched cleanup

The default retention period was reduced from 365 to 90 days, with a minimum of 30 days. The scheduled privacy task now selects and deletes expired messages, snapshots, analytics logs, and AI audit metadata by ID in batches of 10,000, using a database-portable pattern compatible with MySQL, MariaDB, and PostgreSQL.

### Optimised per-student log queries

The analytics log table now includes the composite index `(courseid, userid, timecreated)`. An upgrade step creates the index for existing installations, improving queries that filter a student within a course and time window and order results chronologically.

### Quiz content remains inside Moodle

Quiz question text, alternatives, answers, and correctness markers are not sent to an external AI provider. Only non-textual quiz configuration and aggregate composition metadata, such as question count and type distribution, may be included in pedagogical analysis.

### Explicit external-data declarations

The Moodle Privacy API declaration now identifies forum post content, quiz configuration, withheld quiz questions and answers, course resource content, intervention history, and conversation history explicitly. The quiz question and answer declarations state that these categories are retained inside Moodle and are not part of the current external payload.

### Privacy-safe individual student analysis in Chat

The class chat can now cross-reference per-student educational indicators — grades, interactions, engagement, access, completion, and pending activities — without sending real student identities to the external AI provider. Moodle creates request-scoped aliases (e.g. `Student-001`) before transmission and restores display names locally after the response returns. Email addresses, IP addresses, usernames, enrolment identifiers, and submission content remain blocked by the server-side transport filter.

### Pseudonymised forum text in activity analysis

When the AI analyses a forum activity, enrolled student names that appear inside post bodies are replaced with aliases before the corpus is included in the prompt. A second pseudonymisation pass on the full prompt provides defence in depth.

### Quiz content exclusion

Quiz question text, alternatives and answer keys are never sent to the external provider. AI analysis receives only non-textual quiz configuration and aggregate composition metadata, such as question count and types, attempts, time limit and maximum grade.

### Transport-layer allowlisting extended to JSON arrays

The final transport filter in `client.php` now applies the structured-field allowlist to both scalar JSON values and JSON arrays (e.g. pending activity name lists). Any array field whose key is not explicitly allowlisted is replaced with `"field_omitted":null` before the request leaves Moodle.

### AI audit records data categories per call

The local audit table (`block_mwa_dashboard_aiaudit`) records the allowlisted category set actually present in each AI call — `forum_post_content`, `pseudonymised_individual_metrics`, `aggregate_context`, and others — without storing the prompt or response body. This enables per-operation accountability tracing.

### Privacy provider fully revised

`classes/privacy/provider.php` includes complete documentation covering all five internal tables (`log`, `messages`, `snapshot`, `aiaudit`, and the per-course capture configuration) and both external AI endpoints, explaining what each table stores, what each endpoint receives, which safeguards apply, and under what conditions transmission occurs.

### Dead code and obsolete answer-key access removed

- Removed the unused `ctxMsg` text-assembly block (~75 lines) from `chat.js` — the structured `ctx` object is the actual transmission path.
- Removed the orphaned `redact_students_from_chat()` method from `external.php` — superseded by `pseudonymize_students_for_ai()`.
- Removed the obsolete answer-key capability and the question/alternative extraction path.

---

## Author

**Bruno Porto**
Professor and Researcher — IFES/CEFOR
Espírito Santo, Brazil — 2026
