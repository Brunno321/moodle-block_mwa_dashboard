# MWA Analytics Dashboard

A Moodle 4.1+ block plugin that provides a Learning Analytics dashboard to support teachers in monitoring student participation, activity completion, content access, grades, alerts, interventions, and follow-up outcomes.

The MWA Analytics Dashboard turns Moodle data into clear pedagogical indicators, helping teachers identify students who need attention, understand class behaviour, and act with more precise interventions.

---

## Requirements

| Item | Requirement |
| --- | --- |
| Moodle | 4.1 or later |
| PHP | 7.4 or later |
| Plugin type | Block |
| Component | `block_mwa_dashboard` |
| Current release | **3.5** |

---

## Installation

1. Go to **Site administration → Plugins → Install plugins**.
2. Upload the plugin ZIP file.
3. Confirm the installation after Moodle validates the package.
4. Add the **MWA Analytics Dashboard** block to a course page.
5. Click **Open dashboard**.

Every time the dashboard is opened, course data is refreshed from Moodle.

> **All core features work immediately after installation — no AI configuration needed.**

---

## Configuring Optional AI Features

AI features are entirely optional. To enable them after installation:

1. Go to **Site administration → Plugins → Blocks → MWA Dashboard settings**.
2. Click **Open MWA Dashboard settings**.
3. In the **AI section**, tick **Enable AI features**.
4. Select your **AI provider** (DeepSeek, OpenAI, Google Gemini, Anthropic, or Institutional).
5. Click **Save changes** — the credential field will appear.
6. Enter the **credential obtained directly from your chosen provider** (not from MWA).
7. Save and click **Test connection** to confirm everything is working.

> MWA does not sell, provide or require any licence, activation code, subscription or commercial key of its own. Credentials are obtained directly from the external provider and stored only on your Moodle server.

---

## Optional Third-party AI Integrations

The MWA Analytics Dashboard is **fully functional without any external AI service**. All core features — dashboard, analytics, grades, alerts, interventions, class lists, student profiles, heatmaps, activities and follow-up reports — work without an AI provider or credential.

**MWA does not sell, provide or require any licence, activation code, subscription or commercial key of its own.**

Optional AI-assisted features (chat assistant, AI-generated recommendations) can be enabled by the site administrator using credentials obtained directly from a supported third-party provider: DeepSeek, OpenAI, Google Gemini, Anthropic, or an institutional AI service. The institution is responsible for its own credentials and any terms of that service. MWA connects directly from the Moodle server to the selected provider without an intermediary server.

When AI is not configured, AI-specific buttons and features are simply not shown. No functionality is locked, gated or degraded.

Before any AI transmission, the plugin applies permission checks, data minimisation, pseudonymisation for individual recommendations, aggregate-only context for chat, and a final filter for direct contact and network identifiers. The credential remains in Moodle server configuration and is never included in dashboard JavaScript.

---

## Dashboard Tabs

### Action Center

The teacher's starting point. Summarises the class and highlights the most important priorities.

- Active students, students with interactions, total interactions, and average interactions per student.
- Class engagement score (donut gauge), calculated only over students with at least one interaction.
- Event distribution chart with clickable slices and legend — jumps directly into Activities filtered by type.
- Grade average and weekly retention curve.
- Urgent students who never accessed Moodle.
- Students with low participation.
- Activities or resources with low reach or low delivery that need review.
- Best access window for communication.

Cards and KPIs navigate directly to the relevant dashboard area, pre-filtered when applicable.

### Alerts

Identifies behavioural patterns that may require teacher attention.

- Never accessed Moodle.
- Viewed but did not submit.
- Sudden engagement drop.
- Early disappearance.
- Symbolic access.
- Reactivated students.

Student names link directly to the corresponding student card in the Class List.

### Class

The main student monitoring area. Lists all enrolled students, including those who have not yet accessed Moodle.

Each student row shows:

- Engagement score (circular indicator).
- Participation label.
- Progress by activity.
- Progress by content.
- Interactions and total time.

Filters: all students, never accessed, low / medium / high participation, student search, and risk ordering. Expandable cards reveal determinants, AI-based recommendation, and quick message action.

### Student Profile

Detailed view of a single student's learning journey.

- Last access, active days, grade, and engagement score.
- Progress by activity and by content.
- Activity in the last 7 days.
- Timeline of access and academic events.
- Daily access journey.
- Activity calendar.
- Private notes.
- Message and contact history.

### Access Heatmap

Shows access distribution by day and hour.

- Period, student, and resource filters.
- Access and dropout visualisation modes.
- Best intervention window suggestion.
- Automatic insights derived from access patterns.

### Activities / Resources

Concentrates activity and resource analysis in one place.

Type filters: Activities (Forum, Assignment, Quiz/H5P), Content/Resources, Underperforming, and text search.

Each card includes:

- Participants, pending students, completion rate, and coverage.
- Delivery status: Low (0–59%), Satisfactory (60–79%), Excellent (80–100%).
- Expandable student name lists and message actions.
- AI suggestion for pedagogical improvement.

H5P activities are classified separately from Quiz/Lesson/SCORM, so filtering or clicking a chart slice never mixes the two types.

### Grades

Shows the class grade situation.

- Approved, in progress, and no-grade KPIs with variation chips.
- Average grade and highest grade.
- Grade distribution chart and approved vs. in-progress chart.
- Status filter, student search, and spreadsheet export in one row.

### Chat with Class

AI assistant with full class context loaded.

Supports teachers with questions about priority students, activities that may be blocking participation, messages to send, content reinforcement, and class engagement patterns.

### Interventions

Records and tracks all pedagogical messages sent from the dashboard.

- Filters by reason (never accessed, low participation, academic pending, academic difficulty, other), status, period, and teacher.
- Reason cards with counts — click to filter the list.
- Period summary: interventions made, unique students, teachers involved, and overall return rate.
- Intervention table with date, student, reason, situation identified, intervention performed, teacher, status, and follow-up.
- Snapshot of the student's situation at intervention time: engagement, grade, pending activities, and completion.
- Status progression: Awaiting return → Returned → Partial progress → Full progress.
- Follow-up reminders and notes per intervention.

### Follow-up Report

Consolidates intervention snapshots with subsequent Moodle data to measure pedagogical impact.

Eight analysis tabs:

- **Overview** — KPIs (tracked students, responded, full progress, partial progress, no response, sustained progress), synthesis donut, and result by intervention reason.
- **Engagement** — before-and-after comparison of engagement, grades, approval, and completed tracked activities, with a line chart per student group.
- **Learning** — student interaction after the intervention: activities completed, resources accessed, new attempts, and resumed access.
- **Interaction** — detail panel with names per indicator.
- **Permanence** — continuity funnel showing sustained, under observation, and not-sustained progress after day 7.
- **Mediation** — response-time averages and full-progress rate by intervention strategy.
- **Trajectory** — per-intervention trajectory table with before/after indicators, response, and progress.
- **AI Report** — AI-generated pedagogical analysis comparing snapshot data with subsequent evidence, respecting the selected filters.

---

## Participation Logic

Participation is based on pedagogical signals, not only clicks.

The dashboard considers content access, activity completion or submission, grades, active days, relevant interactions, and participation in forums, quizzes, H5P, assignments, and other evaluated modules. Students who only navigate briefly do not receive a high score.

| Range | Label |
| --- | --- |
| 0% | Never accessed Moodle |
| 1% – 40% | Low participation |
| 41% – 69% | Medium participation |
| 70% or more | High participation |

---

## Version 3.5 Highlights — August 2026

- Activity coverage and class-chat coverage now use the same denominator: only students with at least one Moodle interaction are counted in the percentage.
- Action Center average interactions per student uses students with interactions as the denominator.
- AI audit persistence was hardened so audit-table issues do not interrupt Chat with Class, activity suggestions, or AI reports.
- AI governance improvements include local audit metadata, retention controls, API-key rotation tracking, allowlisted fields, server-side minimisation, pseudonymisation, aggregate-only chat context, and automated anti-leakage tests.
- Removed duplicate heading from the intervention-reason result chart and corrected literal line-break rendering in intervention descriptions.
- New **Follow-up Report** (full page title: Learning Follow-up and Progress Report) with eight responsive analysis tabs: overview, engagement, learning, interaction, permanence, mediation, trajectory, and AI reporting.
- In-page **AI Report** workflow that compares intervention snapshots with subsequent Moodle evidence and produces a structured pedagogical report.
- **Interventions tab** redesigned with reason cards and counts, period summary panel, period/reason/status/teacher filters, snapshot viewer, and consistent status progression (Awaiting return → Returned → Partial progress → Full progress).
- Standardised progress classification across all KPIs, charts, summaries, and trajectory tables.
- Before-and-after analysis covering engagement, grades, approval, tracked activities, continuity, and daily access trajectory.
- Response-time indicators distinguish first real Moodle return from academic-action time.
- Progress by mediation strategy with integral and partial results, comparative visualisation, and explicit non-causality notice.
- Advanced report filters, PDF export, improved intervention summaries, and clearer follow-up status presentation.
- Class List synchronised with the current course catalogue: new activities and resources appear even before first access.
- Improved AI privacy: student names are replaced with Moodle user aliases before external requests and restored locally in the returned report.
- Expanded Moodle language-pack coverage (Portuguese and English) with all client-side strings registered in `string_keys()`.
- Regenerated synchronised, properly minified AMD production artefacts for all modules.
- Refined typography, tab sizing, KPI alignment, help icons, tooltip stacking, and responsive layouts across all tabs.

---

## Author

**Bruno Porto**
Professor and Researcher — IFES/CEFOR
Espírito Santo, Brazil — 2026
