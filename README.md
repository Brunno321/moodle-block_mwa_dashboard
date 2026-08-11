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
| Current release | **3.6** |

---

## Installation

1. Go to **Site administration → Plugins → Install plugins**.
2. Upload the plugin ZIP file.
3. Confirm the installation after Moodle validates the package.
4. Add the **MWA Analytics Dashboard** block to a course page.
5. Click **Open dashboard**.

Every time the dashboard is opened, course data is refreshed automatically from Moodle.

> **All core features work immediately after installation — no AI configuration needed.**

---

## Configuring Optional AI Features

AI features are entirely optional and disabled by default. To enable them:

1. Go to **Site administration → Plugins → Blocks → MWA Dashboard settings**.
2. Click **Open MWA Dashboard settings**.
3. Tick **Enable AI features**.
4. Select an **AI provider** (DeepSeek, OpenAI, Google Gemini, Anthropic, or Institutional).
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

## Version 3.6 Highlights

### Privacy-safe individual student analysis in Chat

The class chat can now cross-reference per-student educational indicators — grades, interactions, engagement, access, completion, and pending activities — without sending real student identities to the external AI provider. Moodle creates request-scoped aliases (e.g. `Student-001`) before transmission and restores display names locally after the response returns. Email addresses, IP addresses, usernames, enrolment identifiers, and submission content remain blocked by the server-side transport filter.

### Pseudonymised forum text in activity analysis

When the AI analyses a forum activity, enrolled student names that appear inside post bodies are replaced with aliases before the corpus is included in the prompt. A second pseudonymisation pass on the full prompt provides defence in depth.

### Quiz answer-key access control

Quiz question text and alternatives are always available for AI pedagogical analysis. The correctness markers (`[CORRECT]`) are transmitted to the external provider only when the initiating user holds the dedicated `block/mwa_dashboard:viewanswers` capability, which is granted exclusively to the `manager` archetype by default. Teachers and editing teachers receive question text without the answer key.

### Transport-layer allowlisting extended to JSON arrays

The final transport filter in `client.php` now applies the structured-field allowlist to both scalar JSON values and JSON arrays (e.g. pending activity name lists). Any array field whose key is not explicitly allowlisted is replaced with `"field_omitted":null` before the request leaves Moodle.

### AI audit records data categories per call

The local audit table (`block_mwa_dashboard_aiaudit`) records the allowlisted category set actually present in each AI call — `forum_posts_anonymised`, `question_text_only`, `question_answer_key`, `pseudonymised_individual_metrics`, `aggregate_context`, and others — without storing the prompt or response body. This enables per-operation accountability tracing.

### Privacy provider fully revised

`classes/privacy/provider.php` was rewritten with complete inline documentation covering all four internal tables (`log`, `messages`, `snapshot`, `aiaudit`) and both external AI endpoints, explaining exactly what data each transmits, which safeguards apply, and under what conditions transmission occurs. All new data categories introduced in 3.6 are declared explicitly.

### Dead code removed, capability check optimised

- Removed the unused `ctxMsg` text-assembly block (~75 lines) from `chat.js` — the structured `ctx` object is the actual transmission path.
- Removed the orphaned `redact_students_from_chat()` method from `external.php` — superseded by `pseudonymize_students_for_ai()`.
- Hoisted the `has_capability('block/mwa_dashboard:viewanswers')` call from inside the per-alternative loop to once per quiz analysis request.

---

## Author

**Bruno Porto**
Professor and Researcher — IFES/CEFOR
Espírito Santo, Brazil — 2026
