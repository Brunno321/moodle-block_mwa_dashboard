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
 * Output renderer for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard\output;

use plugin_renderer_base;

/**
 * Renders block_mwa_dashboard output components.
 */
class renderer extends plugin_renderer_base {

    /**
     * Render the full dashboard page.
     *
     * @param dashboard_page $page Renderable dashboard page.
     * @return string Rendered HTML.
     */
    public function render_dashboard_page(dashboard_page $page): string {
        return $this->render_from_template('block_mwa_dashboard/dashboard_page', $page->export_for_template($this));
    }
}
