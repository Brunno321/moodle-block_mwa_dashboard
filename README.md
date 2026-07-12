# MWA Analytics Dashboard

> **Block plugin for Moodle 4.1+** — Learning Analytics dashboard for instructors, built as part of a Master's research project at IFES/CEFOR in the context of Distance Education (EaD) and teacher training.

---

## Overview

MWA Analytics Dashboard transforms Moodle course logs and grade data into actionable pedagogical intelligence. Instead of navigating scattered reports, the instructor sees in one screen: **which students are at risk**, **which activities are blocking the class**, **when students are most active**, and **what to do right now** — all generated from real Moodle data.

With integrated AI, the plugin goes beyond numbers: it **diagnoses each student's situation individually**, **generates personalised study plans**, **suggests improvements to course activities**, and **writes pedagogical messages ready to send**. Instructors receive concrete guidance, not just raw data.

---

## Requirements

| Item | Minimum |
|------|---------|
| Moodle | 4.1 (build 2022112800) |
| PHP | 7.4 |
| Moodle email | Configured (for email send type) |
| AI server *(optional)* | Any HTTP endpoint compatible with the MWA payload format |

---

## Installation

1. Download the plugin ZIP from the Moodle Plugins Directory
2. Go to **Site Administration → Plugins → Install plugins**
3. Upload the ZIP and follow the prompts
4. Go to **Site Administration → Plugins → Blocks → MWA Dashboard → Settings** to configure the AI server (optional) and verify Moodle email settings
5. Add the **MWA Analytics Dashboard** block to any course page
6. Click **Open Dashboard** — the plugin fetches logs and grades automatically

> **Alternative:** Extract the ZIP into `<moodle_root>/blocks/mwa_dashboard/` and visit the admin notifications page.

---

## Configuration

All settings are under **Site Administration → Plugins → Blocks → MWA Dashboard**.

### AI Server (optional)

AI features (individual recommendations, personalised plans, content analysis, message generation, class chat) require an external AI server. Without configuration, all other dashboard features work normally — only AI buttons are disabled.

| Setting | Description | Example |
|---------|-------------|---------|
| **Endpoint URL** | Base URL of the AI server. The plugin calls `POST {endpoint}/ia` for recommendations and `POST {endpoint}/chat` for the chat tab. Leave blank to disable all AI features. | `https://your-server.com` |
| **API Key** | Optional `X-API-Key` header sent with every request to protect your endpoint. | `my-secret-key` |
| **Provider** | `Google Gemini` or `OpenAI (GPT-4o)` — the server must support the chosen provider. | Google Gemini |
| **Timeout** | Maximum seconds to wait for the AI response (default: 90 s). | `90` |

**AI payload format** — the plugin sends:
```json
[{
  "nomecompleto": "Student Name or Class",
  "instrucao": "<generated prompt with real course data>",
  "contexto": "Dashboard MWA"
}]
```
The server must respond with `{ "resposta": "..." }`, `{ "response": "..." }` or `{ "content": "..." }`.

**AI-powered features:**
- 🔮 Individual engagement prediction with diagnosis and immediate action
- 🎯 Personalised 4-section study plan per student
- 📖 Content analysis — bottleneck diagnosis per activity + 3 course-level suggestions
- ✨ Generate message with AI — subject and body tailored to each student's context
- 💡 Chat with the class — ask the AI anything using live course data as context
- 📖 Per-activity AI button — specific improvement suggestions for each stuck activity

### Moodle Email (SMTP)

Email sending uses Moodle's own `email_to_user()` function. To set it up:

1. Go to **Site Administration → Server → Email → Outgoing mail configuration**
2. Configure your SMTP host, port, username and password
3. Use the **"Test outgoing mail configuration"** button to confirm it works

No additional configuration is needed in MWA Dashboard — the plugin inherits Moodle's mail settings automatically.

| SMTP | Host | Port | Security |
|------|------|------|----------|
| Gmail | `smtp.gmail.com` | 587 | TLS (STARTTLS) |
| Outlook / Microsoft 365 | `smtp.office365.com` | 587 | TLS (STARTTLS) |
| Yahoo | `smtp.mail.yahoo.com` | 465 | SSL |

> **Gmail tip:** Enable two-step verification and generate an **App Password** (not your Google account password) to use as the SMTP password.

---

## Dashboard Tabs

### 🎯 Action Center

The starting screen. Five smart KPIs each show the current value plus a **▲/▼/▬ delta chip** comparing the recent half of log activity with the earlier half:

- **Students in log** — unique students with recorded activity
- **Total interactions** — all Moodle log events
- **Average / student** — interactions per active student
- **At risk** — students with engagement score < 40% (▼ green = fewer at risk = improvement)
- **Grade average** — mean raw grade across all students

**Three action cards:**
- **🔴 Urgent** — Students with score < 40%. Coloured avatars; click an avatar to open the student profile. ✉️ Message button opens a bulk message modal.
- **🟡 Attention** — Activities with coverage below the adaptive threshold. Button navigates to the Activities tab.
- **💡 Opportunity** — Peak access hour detected in logs with mini bar chart. Button navigates to the Heatmap.

**Priority list** — up to 5 highest-risk students. "View full list (N)" button navigates to Engagement Prediction. Clicking a student opens the **AI Prediction panel** with risk factors, weighted progress bars and feedback buttons.

**Weekly Retention Curve** — unique active students per week, colour-coded by trend. Click any data point for a drill-down: who did not return, who returned/joined, how many continued.

**Engagement Index + Event Distribution** — gauge chart of the class average score and a doughnut chart of resource types accessed (System and Login events excluded automatically).

---

### 🔔 Alerts

Six behavioural pattern detectors with **▲/▼ delta chips**. Each alert lists affected students with quick-message buttons.

| Alert | Meaning |
|-------|---------|
| 👁 Viewed, not submitted | Accessed but never delivered |
| 📉 Sharp drop | Week-over-week access fell > 30% |
| 👻 Ghosts | Vanished early in the course — high dropout risk |
| ⚡ Symbolic access | Logged in on ≤ 2 days — presence without engagement |
| 🔄 Reactivated | Returned after a period of absence |
| 🌙 Night owls | ≥ 45% of accesses between 0h–5h |

---

### 👥 Class List

Full student roster in a table with: engagement score bar, last access date, days without access, total time, interactions and a quick-message button per student. Toggle between participation % and activities completed in the 4th column.

**Engagement score formula:**
```
# With grades released:
score = grade(50%) + activity_coverage(30%) + submissions(20%)

# Without grades (capped at 35%):
score = min(35, coverage × 30%)

# No grade data available:
score = coverage(60%) + submissions(40%)
```

---

### 👤 Student Profile

Detailed individual panel accessible by clicking any student name anywhere in the dashboard:

- Engagement score, last access, total interactions, active days, average session time, peak hour, favourite resource type
- GitHub-style activity calendar
- Daily access distribution chart (hour by hour)
- Grade per activity (colour-coded)
- Full contact history (messages sent via the dashboard)
- Quick message button

---

### 📋 Activities

Per-resource breakdown for every forum, task, quiz, SCORM, H5P and other activity. Clicking a resource opens a **detail modal** with:

- Participated / Pending / Completion rate KPIs
- Time per student ranking (session-based estimate from log timestamps)
- **✉️ Message to pending (N)** — bulk message to students who accessed but did not submit
- **✉️ Message with no access (N)** — bulk message to students who never accessed

---

### 📝 Grades

Grade overview with raw-value distribution histogram (0–20, 20–40, 40–60, 60–80, 80–100) and per-student detail. KPIs — Average, Approved (≥ 60 pts), In progress, No grade — each with **▲/▼ delta chip**.

**Export spreadsheet** — generates a native `.xlsx` (no external library) with: Student, Total Grade, Status, and one column per graded activity. First row frozen, column widths adjusted.

---

### 📖 Content Analysis IA

Analyses resource reach and submission patterns across the entire course.

**Where students get stuck** — tasks and quizzes ranked by % of non-submission. Each item shows:
- Submitted vs not submitted counts
- Names of likely stuck students (cross-referenced with access logs)
- Severity badge (critical / attention / low)
- **✨ AI button** per item — diagnosis, content improvement and immediate action specific to that activity

**Materials with low access** — adaptive threshold: < 10 students = 70%, medium classes = 50%, large = 35%.

**Generate AI suggestions** — sends a prompt with all bottleneck data and student names. Returns 3 structured suggestions:
- ⚠️ Most critical bottleneck (cites real resource name)
- 📦 Most ignored material (improvement ideas)
- 🔀 Suggested trail reorganisation

---

### 🔥 Access Heatmap

Day × hour access grid. Hover tooltip shows access count, trend arrow (▲▼) and deadline indicator (🔴). Two modes: **Access** (raw counts) and **Dropout** (students who stopped). Includes grade × time-slot correlation and automatic best intervention window suggestion.

---

### 🔮 Engagement Prediction

AI-powered dropout risk scoring:

- **Engagement score** = grades (50%) + activity coverage (30%) + task delivery (20%)
- Three KPI cards (Low / Average / High participation) with **▲/▼ delta chips**
- Student list filterable by risk category and sortable by score, days without access or name
- Clicking a student → **Generate AI Recommendation**: diagnosis, probable cause, immediate action and suggested message — generated by the AI server

---

### 🎯 Personalised Plan

Individual AI-generated study plans:

- Clicking a student → **Generate Plan** — returns a 4-section plan:
  - 📚 Content Trail — 3 specific activities for this student's profile
  - ⏰ Suggested Rhythm — ideal frequency and session duration
  - 🎓 Learning Style — identified from access patterns
  - ✅ Immediate Action — one concrete action for today
- Copy plan to clipboard button

---

### 💡 Chat with the Class

Conversational AI tab that uses live course data (student counts, scores, active alerts, activity names) as context. Ask anything: which students need attention, which activity is causing problems, draft an announcement, suggest a re-engagement strategy.

The conversation is session-only and does not persist between page loads.

---

### ✉️ Messaging

The message modal is accessible from any tab. All sending uses Moodle's native infrastructure.

**Two send types:**
- **💬 Moodle Message** — `message_send()` API. Arrives in the student's Moodle notifications. If the student has email notifications enabled, Moodle also delivers by email. Requires no additional configuration.
- **📧 Email** — `email_to_user()`. Requires Moodle SMTP configured. Sent from Moodle's noreply address.

**Generate with AI (✨)** — the AI button in the modal footer uses the student's score, days without access, current grade, selected reason and chosen channel to auto-generate the subject and body. Tone adapts: formal for email, friendly for Moodle message.

**Templates:** Low engagement, Dropout risk, Pending task, Re-engagement, Praise.

**Bulk send** — progress bar and per-student status indicator.

---

### 💬 Interventions

Full contact history with effectiveness tracking:

- KPIs: Total sent, Return rate, Average return time, Still inactive
- **Return time** — automatically calculated from logs: how long after the message the student next accessed Moodle
- **Export report** — native `.xlsx` with 8 columns: Date, Student, Reason, Sender, Status, Return time, Channel, Subject

---

## Privacy & Data

The plugin reads existing Moodle log and grade data. Messages use Moodle's native messaging and email infrastructure. Full GDPR/LGPD compliance is declared in `classes/privacy/provider.php`, including export and deletion of all personal data stored in `block_mwa_dashboard_log` and `block_mwa_dashboard_messages`.

---

## Visibility & Access Control

- Visible only on **course pages** (`course-view`)
- **Hidden** on student profiles (`user-profile: false`) and My Courses page (`my: false`)
- Controlled by the `block/mwa_dashboard:view` capability — students do not have this capability by default
- Only users with the **student** role appear in logs, KPIs and lists — teachers, managers and moderators are excluded automatically

---

## Third-party Libraries

| Library | Version | License |
|---------|---------|---------|
| [Chart.js](https://www.chartjs.org/) | 4.4.7 | MIT |

XLSX export and all file generation use native browser APIs (ZIP + OOXML) — no external library required.

---

## Version

**3.1.4** — July 2026  
Maturity: Beta

---

## License

GNU General Public License v3 or later — see [LICENSE](LICENSE) for details.

---

## Author

**Bruno Porto**  
Professor and Researcher — IFES/CEFOR  
Espírito Santo, Brazil — 2026
