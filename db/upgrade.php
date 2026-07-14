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

    return true;
}
