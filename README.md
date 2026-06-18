# moodle-block_mwa_dashboard

A Moodle block plugin that provides real-time learning analytics, engagement prediction, and AI-powered pedagogical intervention tools for instructors.

## Features

- **Action Center** — Urgent alerts: students at risk of dropout, missing submissions, sudden engagement drops
- **Engagement Index** — Multi-dimensional score combining grades (50%), activity coverage (30%), and task delivery (20%)
- **Evasion Prediction** — AI-powered analysis identifying students at risk based on access patterns
- **Student Profiles** — Individual CRM with contact history, private notes, and engagement timeline
- **Activity Analysis** — Per-resource breakdown showing who accessed, who submitted, who didn't
- **Time-on-Resource** — Session-based time estimation per student per activity
- **Heatmap** — Access patterns by day/hour with student names on hover
- **AI Recommendations** — GPT-powered suggestions for course design and individual student intervention
- **Email Integration** — Send personalized emails via Gmail API with auto-logging to contact history
- **Export** — XLSX export for grades, contact reports, and student lists

## Requirements

- Moodle 4.1 or later
- PHP 7.4 or later
- Standard log store enabled (`logstore_standard`)

## Installation

1. Download the plugin ZIP file
2. Go to **Site Administration → Plugins → Install plugins**
3. Upload the ZIP file and follow the prompts
4. Add the **MWA Analytics Dashboard** block to any course page

Alternatively, extract the ZIP into `/blocks/mwa_dashboard/` and visit the admin notifications page.

## Usage

1. Navigate to a course where you have teacher/manager role
2. Click **Open Dashboard** in the MWA block

## Privacy

This plugin reads existing Moodle log and grade data for analysis purposes. It does not store any personal data in its own database tables. See `classes/privacy/provider.php` for the GDPR/LGPD compliance implementation.

## Third-party libraries

- [Chart.js](https://www.chartjs.org/) v4.4.7 (MIT License) — Charts and gauges
- [SheetJS](https://sheetjs.com/) v0.20.3 (Apache-2.0 License) — XLSX import/export

## License

This plugin is licensed under the GNU General Public License v3 or later.
See [LICENSE](https://www.gnu.org/licenses/gpl-3.0.html) for details.

## Author

Bruno Porto - 2026
Educimat/IFES - 2026
