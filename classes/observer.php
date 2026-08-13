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
 * Event observer for block_mwa_dashboard.
 *
 * Captures course-level events into a focused plugin table
 * ({block_mwa_dashboard_log}) so the dashboard can query a small,
 * indexed table instead of the massive logstore_standard_log.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Observer class — single static callback used by all observed events.
 */
class observer {

    /** @var array<int, bool> Request-level cache of course capture settings. */
    private static array $courseenabledcache = [];

    /**
     * Check whether event capture is explicitly enabled for a course.
     *
     * @param int $courseid Course ID.
     * @return bool
     */
    private static function course_is_enabled(int $courseid): bool {
        global $DB;

        if (array_key_exists($courseid, self::$courseenabledcache)) {
            return self::$courseenabledcache[$courseid];
        }

        $enabled = $DB->record_exists('block_mwa_dashboard_course', [
            'courseid' => $courseid,
            'enabled' => 1,
        ]);
        self::$courseenabledcache[$courseid] = $enabled;

        return $enabled;
    }

    /**
     * Invalidate a course setting after it changes in the current request.
     *
     * @param int $courseid Course ID.
     */
    public static function invalidate_course_cache(int $courseid): void {
        unset(self::$courseenabledcache[$courseid]);
    }

    /**
     * Store a course-level event in the plugin's own log table.
     *
     * Skips events that are not related to a course (courseid = 0),
     * anonymous events, and system-level events with no user.
     *
     * @param \core\event\base $event The event object.
     */
    public static function store(\core\event\base $event): void {
        global $DB;

        $data = $event->get_data();

        // Only store course-level events with a real user.
        $courseid = (int)($data['courseid'] ?? 0);
        $userid   = (int)($data['userid'] ?? 0);
        if ($courseid <= 1 || $userid <= 0) {
            // courseid 1 = site-level; skip those and anything without a course.
            return;
        }

        // Skip anonymous events.
        if (!empty($data['anonymous'])) {
            return;
        }

        // Capture only when it was explicitly enabled in this course's block.
        if (!self::course_is_enabled($courseid)) {
            return;
        }

        // Map event data to our compact schema.
        $record = new \stdClass();
        $record->courseid          = $courseid;
        $record->userid            = $userid;
        $record->component         = $data['component'] ?? '';
        $record->action            = $data['action'] ?? '';
        $record->contextinstanceid = (int)($data['contextinstanceid'] ?? 0);
        $record->timecreated       = (int)($data['timecreated'] ?? time());
        $record->origin            = $data['origin'] ?? null;

        try {
            $DB->insert_record('block_mwa_dashboard_log', $record, false);
        } catch (\Exception $e) {
            // Silently fail — an analytics miss is preferable to breaking
            // the user's workflow if the table is temporarily unavailable.
            debugging('block_mwa_dashboard observer: ' . $e->getMessage(), DEBUG_DEVELOPER);
        }
    }
}
