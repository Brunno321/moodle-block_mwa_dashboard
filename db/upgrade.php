<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Upgrade steps for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Execute block_mwa_dashboard upgrade from the given old version.
 *
 * @param int $oldversion The version we are upgrading from.
 * @return bool true on success.
 */
function xmldb_block_mwa_dashboard_upgrade($oldversion) {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026070700) {
        // Create the plugin's own log table.
        $table = new xmldb_table('block_mwa_dashboard_log');

        $table->add_field('id',                  XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('courseid',            XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('userid',              XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('component',           XMLDB_TYPE_CHAR,   '100', null, XMLDB_NOTNULL);
        $table->add_field('action',              XMLDB_TYPE_CHAR,   '100', null, XMLDB_NOTNULL);
        $table->add_field('contextinstanceid',   XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecreated',         XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('origin',              XMLDB_TYPE_CHAR,    '10');
        $table->add_field('ip',                  XMLDB_TYPE_CHAR,    '45');

        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);

        $table->add_index('ix_course_time', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'timecreated']);
        $table->add_index('ix_course_user', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'userid']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_block_savepoint(true, 2026070700, 'mwa_dashboard');
    }

    if ($oldversion < 2026070915) {
        // Create the pedagogical intervention messages table.
        $table = new xmldb_table('block_mwa_dashboard_messages');

        $table->add_field('id',                  XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('courseid',            XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
        $table->add_field('userid',              XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
        $table->add_field('teacherid',           XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
        $table->add_field('subject',             XMLDB_TYPE_CHAR,    '255', null, XMLDB_NOTNULL);
        $table->add_field('message',             XMLDB_TYPE_TEXT,      null, null, XMLDB_NOTNULL);
        $table->add_field('timesent',            XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
        $table->add_field('status',              XMLDB_TYPE_CHAR,     '20',  null, XMLDB_NOTNULL, null, 'sent');
        $table->add_field('ai_generated',        XMLDB_TYPE_INTEGER,   '1',  null, XMLDB_NOTNULL, null, '0');
        $table->add_field('intervention_reason', XMLDB_TYPE_CHAR,    '100');
        $table->add_field('moodle_msgid',        XMLDB_TYPE_INTEGER,  '10');

        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('ix_course_teacher', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'teacherid']);
        $table->add_index('ix_course_student', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'userid']);
        $table->add_index('ix_timesent',       XMLDB_INDEX_NOTUNIQUE, ['timesent']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_block_savepoint(true, 2026070915, 'mwa_dashboard');
    }

    if ($oldversion < 2026070916) {
        // No schema changes — version bump forces Moodle to re-read services.php
        // and register block_mwa_dashboard_delete_intervention.
        upgrade_block_savepoint(true, 2026070916, 'mwa_dashboard');
    }

    if ($oldversion < 2026071102) {
        // FRANK002 fix: rename block_mwa_messages → block_mwa_dashboard_messages
        // to comply with Frankenstyle table naming (plugintype_pluginname_tablename).
        $oldtable = new xmldb_table('block_mwa_messages');
        $newtable = new xmldb_table('block_mwa_dashboard_messages');

        if ($dbman->table_exists($oldtable) && !$dbman->table_exists($newtable)) {
            $dbman->rename_table($oldtable, 'block_mwa_dashboard_messages');
        } else if (!$dbman->table_exists($newtable)) {
            // Fresh install path — table may not exist yet; create it.
            $newtable->add_field('id',                  XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
            $newtable->add_field('courseid',            XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
            $newtable->add_field('userid',              XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
            $newtable->add_field('teacherid',           XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
            $newtable->add_field('subject',             XMLDB_TYPE_CHAR,    '255', null, XMLDB_NOTNULL);
            $newtable->add_field('message',             XMLDB_TYPE_TEXT,      null, null, XMLDB_NOTNULL);
            $newtable->add_field('timesent',            XMLDB_TYPE_INTEGER,  '10',  null, XMLDB_NOTNULL);
            $newtable->add_field('status',              XMLDB_TYPE_CHAR,     '20',  null, XMLDB_NOTNULL, null, 'sent');
            $newtable->add_field('ai_generated',        XMLDB_TYPE_INTEGER,   '1',  null, XMLDB_NOTNULL, null, '0');
            $newtable->add_field('intervention_reason', XMLDB_TYPE_CHAR,    '100');
            $newtable->add_field('moodle_msgid',        XMLDB_TYPE_INTEGER,  '10');
            $newtable->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $newtable->add_index('ix_course_teacher', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'teacherid']);
            $newtable->add_index('ix_course_student', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'userid']);
            $newtable->add_index('ix_timesent',       XMLDB_INDEX_NOTUNIQUE, ['timesent']);
            $dbman->create_table($newtable);
        }

        upgrade_block_savepoint(true, 2026071102, 'mwa_dashboard');
    }

    if ($oldversion < 2026071210) {
        // JS004 fix: template-based rendering update. Also ensure the message
        // table has the send_type field when upgrading from older builds.
        $table = new xmldb_table('block_mwa_dashboard_messages');
        $field = new xmldb_field('send_type', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'moodle');

        if ($dbman->table_exists($table) && !$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_block_savepoint(true, 2026071210, 'mwa_dashboard');
    }

    if ($oldversion < 2026072941) {
        // Store private teacher notes attached to each intervention record.
        $table = new xmldb_table('block_mwa_dashboard_messages');
        $notefield = new xmldb_field('teacher_note', XMLDB_TYPE_TEXT, null, null, null);
        $updatedfield = new xmldb_field('teacher_note_updated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');

        if ($dbman->table_exists($table) && !$dbman->field_exists($table, $notefield)) {
            $dbman->add_field($table, $notefield);
        }

        if ($dbman->table_exists($table) && !$dbman->field_exists($table, $updatedfield)) {
            $dbman->add_field($table, $updatedfield);
        }

        upgrade_block_savepoint(true, 2026072941, 'mwa_dashboard');
    }

    if ($oldversion < 2026073116) {
        // Store tracked activity/resource targets selected in intervention messages.
        $table = new xmldb_table('block_mwa_dashboard_messages');
        $targettypefield = new xmldb_field('target_type', XMLDB_TYPE_CHAR, '30', null, null);
        $targetitemsfield = new xmldb_field('target_items', XMLDB_TYPE_TEXT, null, null, null);

        if ($dbman->table_exists($table) && !$dbman->field_exists($table, $targettypefield)) {
            $dbman->add_field($table, $targettypefield);
        }

        if ($dbman->table_exists($table) && !$dbman->field_exists($table, $targetitemsfield)) {
            $dbman->add_field($table, $targetitemsfield);
        }

        upgrade_block_savepoint(true, 2026073116, 'mwa_dashboard');
    }

    if ($oldversion < 2026080814) {
        $table = new xmldb_table('block_mwa_dashboard_snapshot');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('interventionid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('reason', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL);
        $table->add_field('situation', XMLDB_TYPE_TEXT, null, null, null);
        $table->add_field('actiontaken', XMLDB_TYPE_TEXT, null, null, null);
        $table->add_field('objective', XMLDB_TYPE_TEXT, null, null, null);
        $table->add_field('snapshotdata', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('fk_intervention', XMLDB_KEY_FOREIGN_UNIQUE, ['interventionid'],
            'block_mwa_dashboard_messages', ['id']);
        $table->add_index('ix_course_user', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'userid']);
        $table->add_index('ix_timecreated', XMLDB_INDEX_NOTUNIQUE, ['timecreated']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }
        upgrade_block_savepoint(true, 2026080814, 'mwa_dashboard');
    }

    if ($oldversion < 2026081020) {
        // Data minimisation: IP addresses are not needed by dashboard indicators.
        $table = new xmldb_table('block_mwa_dashboard_log');
        $field = new xmldb_field('ip');
        if ($dbman->table_exists($table) && $dbman->field_exists($table, $field)) {
            $dbman->drop_field($table, $field);
        }
        upgrade_block_savepoint(true, 2026081020, 'mwa_dashboard');
    }

    if ($oldversion < 2026081025) {
        // Remove intermediary-server configuration and require a provider key.
        unset_config('ia_endpoint', 'block_mwa_dashboard');
        unset_config('ia_apikey', 'block_mwa_dashboard');

        $provider = (string)get_config('block_mwa_dashboard', 'ia_provider');
        if ($provider === 'claude') {
            set_config('ia_provider', 'anthropic', 'block_mwa_dashboard');
        } else if (!in_array($provider, ['deepseek', 'openai', 'gemini', 'anthropic'], true)) {
            set_config('ia_provider', 'deepseek', 'block_mwa_dashboard');
        }
        set_config('ia_model', 'recommended', 'block_mwa_dashboard');

        upgrade_block_savepoint(true, 2026081025, 'mwa_dashboard');
    }

    if ($oldversion < 2026081027) {
        // Institutional providers use dedicated credentials and are opt-in.
        set_config('ia_institutional_private', 0, 'block_mwa_dashboard');
        upgrade_block_savepoint(true, 2026081027, 'mwa_dashboard');
    }

    if ($oldversion < 2026081028) {
        // Final transport allowlist and direct-identifier rejection for AI requests.
        upgrade_block_savepoint(true, 2026081028, 'mwa_dashboard');
    }

    if ($oldversion < 2026081029) {
        // Establish the first rotation timestamp without retaining previous credentials.
        if (trim((string)get_config('block_mwa_dashboard', 'ia_apikey')) !== '' &&
                !(int)get_config('block_mwa_dashboard', 'apikey_lastrotated')) {
            set_config('apikey_lastrotated', time(), 'block_mwa_dashboard');
        }
        if (trim((string)get_config('block_mwa_dashboard', 'ia_institutional_apikey')) !== '' &&
                !(int)get_config('block_mwa_dashboard', 'ia_institutional_apikey_lastrotated')) {
            set_config('ia_institutional_apikey_lastrotated', time(), 'block_mwa_dashboard');
        }
        upgrade_block_savepoint(true, 2026081029, 'mwa_dashboard');
    }

    if ($oldversion < 2026081030) {
        // Automated privacy regression tests accompany the hardened transport filter.
        upgrade_block_savepoint(true, 2026081030, 'mwa_dashboard');
    }

    if ($oldversion < 2026081031) {
        $table = new xmldb_table('block_mwa_dashboard_aiaudit');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('operation', XMLDB_TYPE_CHAR, '40', null, XMLDB_NOTNULL);
        $table->add_field('purpose', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL);
        $table->add_field('provider', XMLDB_TYPE_CHAR, '30', null, XMLDB_NOTNULL);
        $table->add_field('endpoint', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('categories', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('status', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('ix_user_time', XMLDB_INDEX_NOTUNIQUE, ['userid', 'timecreated']);
        $table->add_index('ix_course_time', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'timecreated']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }
        upgrade_block_savepoint(true, 2026081031, 'mwa_dashboard');
    }

    if ($oldversion < 2026081032) {
        // Rename credential config keys to remove 'apikey' terminology.
        $migrations = [
            'ia_apikey' => 'ia_provider_credential',
            'apikey_lastrotated' => 'ia_credential_lastrotated',
            'ia_institutional_apikey' => 'ia_institutional_credential',
            'ia_institutional_apikey_lastrotated' => 'ia_institutional_credential_lastrotated',
        ];
        foreach ($migrations as $old => $new) {
            $value = get_config('block_mwa_dashboard', $old);
            if ($value !== false) {
                set_config($new, $value, 'block_mwa_dashboard');
                unset_config($old, 'block_mwa_dashboard');
            }
        }
        upgrade_block_savepoint(true, 2026081032, 'mwa_dashboard');
    }


    if ($oldversion < 2026081078) {
        // Repair AI audit storage for sites upgraded through intermediate development builds.
        // Some installations can have a plugin version newer than the original audit-table
        // migration while the table itself is absent. This makes a successful AI response
        // appear as "Error writing to database" when the audit metadata is recorded.
        $table = new xmldb_table('block_mwa_dashboard_aiaudit');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('operation', XMLDB_TYPE_CHAR, '40', null, XMLDB_NOTNULL);
        $table->add_field('purpose', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL);
        $table->add_field('provider', XMLDB_TYPE_CHAR, '30', null, XMLDB_NOTNULL);
        $table->add_field('endpoint', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('categories', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('status', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('ix_user_time', XMLDB_INDEX_NOTUNIQUE, ['userid', 'timecreated']);
        $table->add_index('ix_course_time', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'timecreated']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }
        upgrade_block_savepoint(true, 2026081078, 'mwa_dashboard');
    }

    if ($oldversion < 2026081080) {
        // Re-check audit storage after the 1.0.78 repair. AI functionality itself is
        // non-blocking if audit persistence is temporarily unavailable.
        $table = new xmldb_table('block_mwa_dashboard_aiaudit');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('operation', XMLDB_TYPE_CHAR, '40', null, XMLDB_NOTNULL);
        $table->add_field('purpose', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL);
        $table->add_field('provider', XMLDB_TYPE_CHAR, '30', null, XMLDB_NOTNULL);
        $table->add_field('endpoint', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('categories', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('status', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('ix_user_time', XMLDB_INDEX_NOTUNIQUE, ['userid', 'timecreated']);
        $table->add_index('ix_course_time', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'timecreated']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }
        upgrade_block_savepoint(true, 2026081080, 'mwa_dashboard');
    }

    if ($oldversion < 2026081204) {
        // Optimise per-student log queries constrained and ordered by time.
        $table = new xmldb_table('block_mwa_dashboard_log');
        $index = new xmldb_index(
            'ix_course_user_time',
            XMLDB_INDEX_NOTUNIQUE,
            ['courseid', 'userid', 'timecreated']
        );
        if ($dbman->table_exists($table) && !$dbman->index_exists($table, $index)) {
            $dbman->add_index($table, $index);
        }
        upgrade_block_savepoint(true, 2026081204, 'mwa_dashboard');
    }

    return true;
}
