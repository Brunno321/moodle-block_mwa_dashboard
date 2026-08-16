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
| Current release | **3.8** |

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
Teacher's starting point. Summarises the class and highlights priorities: active students, at-risk students, low-coverage activities, best communication window, and quick navigation cards to any dashboard area.

### Alerts
Identifies behavioural patterns requiring attention: never accessed, viewed but not submitted, sudden engagement drop, early disappearance, symbolic access, and reactivation.

### Class
Main student monitoring area. Lists all enrolled students — including those who have not yet accessed Moodle — with engagement score, participation label, activity and content progress, interactions, and expandable cards with AI recommendations and quick message actions.

### Student Profile
Detailed view of a single student: last access, active days, grade, engagement score, activity and content progress, last-7-days activity, access timeline, daily journey, activity calendar, private notes, and message history.

### Access Heatmap
Access distribution by day and hour, with period, student, and resource filters, dropout visualisation mode, best intervention window suggestion, and automatic access-pattern insights.

### Activities / Resources
Activity and resource analysis in one place. Covers forums, assignments, quizzes, H5P, and content resources. Each card shows participants, pending students, completion rate, coverage, and AI-generated pedagogical suggestions.

### Grades
Class grade overview with approved/in-progress/no-grade KPIs, grade distribution chart, filters, and spreadsheet export.

### Chat with Class
AI assistant with the full class context loaded. Supports questions about priority students, blocking activities, messages to send, content reinforcement, and engagement patterns. Individual student metrics are pseudonymised before the request reaches the provider.

### Interventions
Records and tracks all pedagogical messages sent from the dashboard. Includes reason cards with counts, period summary, filters, intervention table with snapshots, follow-up status progression, and per-intervention notes.

### Follow-up Report
Eight analysis tabs — Overview, Engagement, Learning, Interaction, Permanence, Mediation, Trajectory, and AI Report — that consolidate intervention snapshots with subsequent Moodle data to measure pedagogical impact.

---

## Participation Logic

Participation is based on pedagogical signals, not only page clicks. The score considers content access, activity completion or submission, grades, active days, and relevant interactions across forums, quizzes, H5P, assignments, and other evaluated modules.

| Range | Label |
| --- | --- |
| 0 % | Never accessed Moodle |
| 1 %–40 % | Low participation |
| 41 %–69 % | Medium participation |
| 70 % or more | High participation |

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
