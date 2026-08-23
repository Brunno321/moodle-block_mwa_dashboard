# Privacy and Data Protection

## Implemented controls

- External AI processing is disabled by default. The institution must explicitly enable it, select a supported provider and supply its own API credential.
- Only users with the `block/mwa_dashboard:useai` or `block/mwa_dashboard:manageinterventions` capability can trigger external AI requests.
- Student names are replaced with request-scoped aliases (e.g. `Student-001`) inside Moodle before any data is transmitted. Real names are restored locally after the AI response is received.
- The class chat transmits only aggregate class and activity metrics. Per-student records are pseudonymised server-side — real names, email addresses, usernames, enrolment identifiers and Moodle user IDs are never sent.
- Forum post corpora are pseudonymised before being included in the AI prompt. Enrolled student names appearing inside post text are replaced with aliases.
- Quiz question text, alternatives and answer keys are never included in external AI requests. Only non-textual configuration and aggregate composition metadata may be transmitted.
- A final server-side transport filter removes email addresses, IP addresses, enrolment identifiers, submission file content and any structured field not on the explicit allowlist before any request leaves Moodle.
- IP addresses are not collected in the plugin event table.
- The AI credential is stored only in Moodle server configuration and never appears in dashboard JavaScript or client-side code.
- Moodle user IDs are not used in external aliases.
- Student-submitted files are not read by the content extractor.
- Requests go directly from the Moodle server to the selected provider (DeepSeek, OpenAI, Google Gemini, Anthropic, or an institutional endpoint). There is no MWA intermediary server.
- Every external AI call is recorded locally in an audit table (`block_mwa_dashboard_aiaudit`) with the initiating user, course, operation, purpose, provider, endpoint and data categories — without storing the prompt, the response or any student identifier.
- Data retention is configurable and enforced by a scheduled cleanup task.
- Interventions require a dedicated capability and a recipient who is actively enrolled in the course.
- The Moodle Privacy API provider exports, anonymises and deletes logs, messages, snapshots and audit entries on request.

## Institutional responsibilities

These controls reduce technical risk but do not replace legal and governance analysis. Before enabling AI, the institution must:

- Document the processing purpose and legal basis.
- Inform data subjects where applicable.
- Assess necessity and proportionality.
- Define and enforce retention periods.
- Sign a data processing agreement with the chosen provider.
- Audit the provider's subprocessors, international transfers, log policies, model training terms, data location and deletion procedures.
- Establish an incident response procedure.
- Maintain a record of processing activities (ROPA).

There is no MWA intermediary server. The selected provider's own policies on logging, retention, model training, data location, security and deletion must be assessed separately by the institution.
