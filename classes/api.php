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
 * Data access layer for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * API class with static methods for fetching logs and grades.
 */
class api {

    /** @var int Maximum number of log records to return. */
    const LOG_LIMIT = 50000;

    /**
     * Build a map of course_module_id => activity name for all modules in a course.
     *
     * @param int $courseid The course ID.
     * @return array Map of cmid => name.
     */
    private static function build_cm_name_map(int $courseid): array {
        global $DB;

        $map = [];

        $cms = $DB->get_records_sql("
            SELECT cm.id, m.name AS modname, cm.instance
            FROM {course_modules} cm
            JOIN {modules} m ON m.id = cm.module
            WHERE cm.course = :courseid
        ", ['courseid' => $courseid]);

        // Group by module type to batch-query names.
        $bytype = [];
        foreach ($cms as $cm) {
            $bytype[$cm->modname][$cm->id] = $cm->instance;
        }

        foreach ($bytype as $modname => $instances) {
            try {
                $ids = array_values($instances);
                if (empty($ids)) {
                    continue;
                }
                list($insql, $params) = $DB->get_in_or_equal($ids, SQL_PARAMS_NAMED);
                $names = $DB->get_records_select($modname, "id $insql", $params, '', 'id, name');
                foreach ($instances as $cmid => $instanceid) {
                    if (isset($names[$instanceid])) {
                        $map[$cmid] = $names[$instanceid]->name;
                    }
                }
            } catch (\Exception $e) {
                // Some module types might not have a 'name' column.
                continue;
            }
        }

        return $map;
    }

    /**
     * Get access logs for a course, formatted for the dashboard.
     *
     * @param int $courseid The course ID.
     * @param int $since    Only return logs after this Unix timestamp.
     * @return array Array of log records.
     */
    public static function get_logs(int $courseid, int $since = 0): array {
        global $DB;

        $namemap = self::build_cm_name_map($courseid);

        $sql = "
            SELECT
                l.id,
                " . $DB->sql_concat("u.firstname", "' '", "u.lastname") . " AS fullname,
                u.email,
                l.userid,
                l.component,
                l.action,
                l.contextinstanceid,
                l.timecreated,
                l.origin,
                l.ip
            FROM {logstore_standard_log} l
            JOIN {user} u ON u.id = l.userid
            WHERE l.courseid = :courseid
              AND l.userid != 0
              AND l.anonymous = 0
              " . ($since > 0 ? "AND l.timecreated > :since" : "") . "
            ORDER BY l.timecreated DESC
        ";

        $params = ['courseid' => $courseid];
        if ($since > 0) {
            $params['since'] = $since;
        }

        $records = $DB->get_records_sql($sql, $params, 0, self::LOG_LIMIT);

        $logs = [];
        foreach ($records as $r) {
            $dt = new \DateTime('@' . $r->timecreated);
            $dt->setTimezone(new \DateTimeZone('America/Sao_Paulo'));

            $cmid    = (int)($r->contextinstanceid ?? 0);
            $actname = $namemap[$cmid] ?? null;
            $modtype = str_replace(['mod_', 'core'], '', $r->component);
            $context = $actname ?: $modtype;

            $logs[] = [
                'hora'             => $dt->format('d/m/y, H:i:s'),
                'nomecompleto'     => trim($r->fullname),
                'email'            => $r->email,
                'usurioafetado'    => '-',
                'contextodoevento' => $context,
                'componente'       => self::translate_component($r->component),
                'nomedoevento'     => self::translate_action($r->action, $r->component),
                'descrio'          => '',
                'origem'           => $r->origin,
                'endereoip'        => $r->ip,
                '_ts'              => (int)$r->timecreated,
                '_cmid'            => $cmid,
                '_modtype'         => $modtype,
            ];
        }

        return $logs;
    }

    /**
     * Get grades for all students in a course.
     *
     * @param int $courseid The course ID.
     * @return array Array of student grade records.
     */
    public static function get_grades(int $courseid): array {
        global $DB;

        $items = $DB->get_records_select(
            'grade_items',
            "courseid = :cid AND itemtype = 'mod' AND hidden = 0",
            ['cid' => $courseid],
            'sortorder ASC'
        );

        $context  = \context_course::instance($courseid);
        $students = get_enrolled_users($context, 'mod/assign:submit', 0,
                        'u.id, u.firstname, u.lastname, u.email');

        $rows = [];
        foreach ($students as $stu) {
            $row = [
                'Nome'      => $stu->firstname,
                'Sobrenome' => $stu->lastname,
                'Email'     => $stu->email,
            ];

            $total    = 0;
            $totalmax = 0;
            foreach ($items as $item) {
                $grade = $DB->get_record('grade_grades', [
                    'itemid' => $item->id,
                    'userid' => $stu->id,
                ]);
                $val = $grade ? round((float)$grade->finalgrade, 1) : null;
                $key = 'Atividade ' . $item->sortorder . ' - '
                     . ($item->itemname ?: $item->itemtype) . ' (Real)';
                $row[$key] = $val !== null ? $val : '-';
                if ($val !== null) {
                    $total    += $val;
                    $totalmax += (float)($item->grademax ?: 100);
                }
            }

            $row['Total do curso (Real)'] = $totalmax > 0
                ? round(($total / $totalmax) * 100, 1)
                : null;

            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * Get list of courses the current user can view the dashboard for.
     *
     * @return array Array of course records with id, fullname, shortname.
     */
    public static function get_accessible_courses(): array {
        global $USER;

        $courses = enrol_get_all_users_courses($USER->id, true);
        $result  = [];
        foreach ($courses as $c) {
            $ctx = \context_course::instance($c->id);
            if (has_capability('block/mwa_dashboard:view', $ctx)) {
                $result[] = [
                    'id'        => $c->id,
                    'fullname'  => $c->fullname,
                    'shortname' => $c->shortname,
                ];
            }
        }
        return $result;
    }

    /**
     * Translate a Moodle component name to a human-readable label.
     *
     * @param string $comp The component name.
     * @return string Translated label.
     */
    private static function translate_component(string $comp): string {
        $map = [
            'mod_forum'       => 'Forum',
            'mod_assign'      => 'Tarefa',
            'mod_quiz'        => 'Questionario',
            'mod_h5pactivity' => 'H5P',
            'mod_scorm'       => 'Pacote SCORM',
            'mod_page'        => 'Pagina',
            'mod_book'        => 'Livro',
            'mod_url'         => 'URL',
            'mod_resource'    => 'Arquivo',
            'mod_folder'      => 'Pasta',
            'mod_glossary'    => 'Glossario',
            'mod_lesson'      => 'Licao',
            'mod_wiki'        => 'Wiki',
            'mod_choice'      => 'Escolha',
            'core'            => 'Sistema',
        ];
        return $map[$comp] ?? ucfirst(str_replace(['mod_', 'core_'], '', $comp));
    }

    /**
     * Translate a Moodle log action to a human-readable label.
     *
     * @param string $action The action name.
     * @param string $comp   The component name (for context).
     * @return string Translated label.
     */
    private static function translate_action(string $action, string $comp): string {
        $map = [
            'viewed'             => 'Modulo do curso visualizado',
            'submitted'          => 'Um envio foi submetido.',
            'uploaded'           => 'Um arquivo foi enviado.',
            'graded'             => 'O envio foi avaliado.',
            'created'            => 'Algum conteudo foi publicado.',
            'loggedin'           => 'Usuario logado',
            'loggedout'          => 'Usuario saiu',
            'attempt_submitted'  => 'Tentativa do questionario enviada',
            'attempt_started'    => 'Tentativa do questionario iniciada',
            'course_viewed'      => 'Curso visto',
            'post_created'       => 'Algum conteudo foi publicado.',
            'discussion_created' => 'Discussao criada',
            'discussion_viewed'  => 'Discussao visualizada',
        ];
        return $map[$action] ?? $action;
    }
}
