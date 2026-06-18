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
 * Iframe host for the MWA Dashboard HTML application.
 *
 * Reads dashboard.html, injects Moodle configuration variables,
 * and serves it as a standalone page inside the Moodle iframe.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once('../../config.php');
global $CFG, $DB;

require_login();

while (ob_get_level()) {
    ob_end_clean();
}

$file = __DIR__ . '/dashboard.html';
if (!file_exists($file)) {
    header('Content-Type: text/html; charset=utf-8');
    echo 'dashboard.html not found.';
    exit;
}

$courseid   = optional_param('course', 0, PARAM_INT);
$ajaxurl    = '';
$sesskey    = '';
$coursename = '';

if ($courseid > 0) {
    $context = context_course::instance($courseid);
    if (has_capability('block/mwa_dashboard:view', $context)) {
        $ajaxurl    = $CFG->wwwroot . '/blocks/mwa_dashboard/ajax.php';
        $sesskey    = sesskey();
        $coursename = (string)$DB->get_field('course', 'fullname', ['id' => $courseid]);
    }
}

$html = file_get_contents($file);

// Inject Moodle config vars as the first thing inside <head>.
$inject = '<script id="mwa-cfg">'
    . 'window.MWA_AJAX="'     . addslashes($ajaxurl)    . '";'
    . 'window.MWA_SESSKEY="'  . addslashes($sesskey)    . '";'
    . 'window.MWA_COURSE='    . (int)$courseid          . ';'
    . 'window.MWA_WWWROOT="'  . addslashes($CFG->wwwroot) . '";'
    . 'window.MWA_COURSENAME="'. addslashes($coursename) . '";'
    . '</script>'
    . '<style id="mwa-block-init">'
    . '#uploadScreen{display:none!important;}'
    . '#dashboard{display:block;padding-top:60px;}'
    . '</style>';

// Add mwa-moodle-mode class to <body> immediately to prevent upload screen flash.
$html = preg_replace('/<body([^>]*)>/i', '<body$1 class="mwa-moodle-mode">', $html, 1);

// Insert right after <head>.
$html = preg_replace('/<head>/i', '<head>' . $inject, $html, 1);

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-cache, no-store, must-revalidate');
echo $html;
exit;
