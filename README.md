# MWA Analytics Dashboard

A Moodle 4.1+ block plugin that provides a Learning Analytics dashboard to support teachers in monitoring student participation, activity completion, content access, grades, alerts, interventions, and follow-up outcomes.

The MWA Analytics Dashboard turns Moodle data into clear pedagogical indicators, helping teachers identify students who need attention, understand class behavior, and act with more precise interventions.

---

## Requirements

| Item | Requirement |
| --- | --- |
| Moodle | 4.1 or later |
| PHP | 7.4 or later |
| Plugin type | Block |
| Component | `block_mwa_dashboard` |

---

## Installation

1. Go to **Site administration > Plugins > Install plugins**.
2. Upload the plugin ZIP file.
3. Confirm the installation after Moodle validates the package.
4. Add the **MWA Analytics Dashboard** block to a course page.
5. Click **Open dashboard**.

Every time the dashboard is opened, course data is refreshed from Moodle.

---

## Main Features

### Action Center

The teacher's starting point. It summarizes the class and highlights the most important priorities.

Includes:

- active students;
- students with interactions;
- total interactions;
- average interactions per student;
- grade average;
- weekly retention curve;
- urgent students who never accessed Moodle;
- students with low participation;
- activities or resources that need review;
- best access window for communication.

Cards and KPIs can take the teacher directly to the relevant dashboard area.

### Alerts

Identifies behavioral patterns that may require intervention.

Examples:

- never accessed Moodle;
- viewed but did not submit;
- sudden drop;
- early disappearance;
- symbolic access;
- reactivated students.

Student names can open the corresponding student card in the class list.

### Class List

The main student monitoring area. It lists all enrolled students, including those who have not accessed Moodle yet.

Each student card can show:

- course participation;
- participation label;
- progress by activity;
- progress by content;
- interactions;
- total time;
- relevant tags;
- determinants;
- AI recommendation;
- message action.

Filters include:

- all students;
- never accessed Moodle;
- low participation;
- medium participation;
- high participation;
- student search;
- risk ordering.

### Individual Profile

Shows the student's learning path in detail.

Includes:

- last access;
- active days;
- grade;
- engagement;
- progress by activity;
- progress by content;
- activity in the last 7 days;
- timeline;
- daily access journey;
- activity calendar;
- message history.

For students who never accessed Moodle, the dashboard shows a simple `-` for last access and classifies engagement as **Never accessed Moodle**.

### Activities/Resources

Concentrates activity and resource analysis in one place.

Cards include:

- participants;
- pending students;
- completion rate;
- coverage;
- delivery status;
- coverage status;
- student time collapsed by default;
- expandable name lists;
- message actions;
- AI suggestion for pedagogical improvement.

The dashboard avoids oversized cards in large classes by collapsing lists and showing more details only when requested.

### Grades

Shows the class grade situation.

Includes:

- approved students;
- students in progress;
- students without grade;
- average grade;
- highest grade;
- grade distribution chart;
- approved vs in progress chart;
- filters by status;
- student search;
- spreadsheet export.

Approved, in progress and no grade KPIs show variation chips based on the current data change.

### Access Heatmap

Shows access distribution by day and hour.

Includes:

- period filters;
- student filter;
- resource filter;
- search by student or resource;
- access and abandonment modes;
- best intervention window;
- automatic insights.

### Class Chat

AI assistant with class context.

It can support the teacher with questions about:

- priority students;
- activities that may be blocking participation;
- messages to send;
- content reinforcement;
- class engagement patterns.

### Interventions

Tracks pedagogical messages sent from the dashboard.

Includes:

- search;
- filters by reason, status and date;
- collapsible intervention cards;
- teacher notes;
- tracked items;
- automatic status.

Tracked status can indicate:

- accessed;
- submitted;
- pending.

### Teacher Feedback

Summarizes the impact of pedagogical interventions.

Includes:

- interventions sent;
- return after contact;
- engagement improvement;
- grade improvement;
- students still at risk;
- before and after chart;
- intervention result chart;
- most effective reasons;
- students who advanced;
- pending follow-up;
- pedagogical summary.

The feedback consolidates students to avoid misleading duplicate counts when the same student received more than one intervention.

---

## Participation Logic

Participation is based on pedagogical signals, not only clicks.

The dashboard considers:

- content access;
- activity completion or submission;
- grades;
- active days;
- relevant interactions;
- participation in forums, quizzes, H5P, assignments, games and other evaluated modules.

Students who only enter and click briefly do not receive a high participation score only because of navigation.

Participation ranges:

- **Never accessed Moodle:** 0%;
- **Low participation:** 1% to 40%;
- **Medium participation:** 41% to 69%;
- **High participation:** 70% or more.

---

## Version

**3.2 — August 2026**  
Maturity: **Stable**

### 3.2 highlights

- Action Center reorganized into four main cards: Urgent, Attention, Review, and Opportunity.
- Class List consolidated as the main student monitoring area, including active students and students who never accessed Moodle.
- Collapsible student cards with participation, progress by activity, progress by content, interactions, total time, labels, and quick actions.
- Prediction and personalized plan features unified into the Class List experience.
- Activities/Resources tab now concentrates completion, coverage, student time, pending messages, and AI suggestions.
- Grades tab improved with KPIs, variation chips, status filters, student search, charts, and spreadsheet export.
- Access Heatmap moved into the Students area, with filters by period, student, resource, and search.
- Interventions redesigned with filters, collapsible cards, tracked items, and automatic status.
- Teacher Feedback added to summarize intervention impact, student progress, pending cases, and effective intervention reasons.
- Message modal standardized by reason, with automatic templates and `{firstname}` support.
- Dashboard refresh removes deleted activities, deleted resources, grade items, and modules in removal progress.
- Internationalization reviewed for better Portuguese and English support.

---

## Author

**Bruno Porto**  
Professor and Researcher — IFES/CEFOR  
Espírito Santo, Brazil — 2026
