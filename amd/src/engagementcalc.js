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
 * @module     block_mwa_dashboard/engagementcalc
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore'], function(Store) {

    'use strict';

    function norm(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    function lower(value) {
        return norm(value).toLowerCase();
    }

    function clamp(value) {
        return Math.max(0, Math.min(100, Math.round(value || 0)));
    }

    function parseDate(log) {
        if (log && log._ts) {
            return new Date(Number(log._ts) * 1000);
        }
        var source = norm(log && log.hora);
        var match = source.match(/(\d{2})\/(\d{2})\/(\d{2}),?\s*(\d{2}):(\d{2})/);
        if (match) {
            return new Date(2000 + Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]));
        }
        return null;
    }

    function studentNameFromGrade(row) {
        var first = norm(row['First name'] || row.Nome || row.firstname || row.student_firstname);
        var last = norm(row['Last name'] || row.Sobrenome || row.lastname || row.student_lastname);
        return norm(row.student_name || row.name || row.nomecompleto || row['Full name'] || (first + ' ' + last));
    }

    function studentEmailFromGrade(row) {
        return norm(row.Email || row.email || row['E-mail'] || row.mail);
    }

    function gradeRows(grades) {
        return (grades || []).filter(function(row) {
            return row && row.__mwa_type__ !== 'activity_names';
        });
    }

    function activityGradeKeys(grades) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        if (meta) {
            return Object.keys(meta).filter(function(key) {
                return /^act_\d+$/.test(key);
            }).filter(function(key) {
                var match = key.match(/^act_(\d+)$/);
                var seq = match ? match[1] : '';
                var now = Math.floor(Date.now() / 1000);
                var due = Number(meta['act_duedate_' + seq] || 0);
                var overdue = due > 0 && now > due;
                return overdue || catalogItemIsOpen({
                    available: meta['act_available_' + seq],
                    availablefrom: meta['act_availablefrom_' + seq],
                    availableuntil: meta['act_availableuntil_' + seq]
                });
            }).sort(function(a, b) {
                return Number(a.split('_')[1]) - Number(b.split('_')[1]);
            });
        }
        var sample = gradeRows(grades)[0] || {};
        return Object.keys(sample).filter(function(key) {
            return /^act_\d+$/.test(key) || /\(grade\)|\(real\)|atividade|activity/i.test(key);
        }).filter(function(key) {
            return !/course\s+total|total\s+do\s+curso|max/i.test(key);
        });
    }

    function numeric(value) {
        if (value === null || value === undefined || value === '' || value === '-') {
            return null;
        }
        var number = parseFloat(String(value).replace(',', '.'));
        return isNaN(number) ? null : number;
    }

    function activityModuleForKey(grades, key) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        var match = String(key || '').match(/^act_(\d+)$/);
        if (!meta || !match) {
            return '';
        }
        return lower(meta['act_module_' + match[1]]);
    }

    function currentStateForKey(row, key) {
        var match = String(key || '').match(/^act_(\d+)$/);
        if (!row || !match) {
            return null;
        }
        var stateKey = 'act_current_' + match[1];
        if (!Object.prototype.hasOwnProperty.call(row, stateKey)) {
            return null;
        }
        var count = parseInt(row[stateKey], 10);
        return isNaN(count) ? 0 : count;
    }

    function effectiveActivityValue(row, key, grades) {
        var module = activityModuleForKey(grades, key);
        var currentState = currentStateForKey(row, key);
        var value = numeric(row && row[key]);
        if (currentState !== null) {
            if (module === 'forum') {
                return currentState > 0 ? (value !== null ? value : 1) : null;
            }
            if (currentState > 0) {
                return value !== null ? value : 1;
            }
        }
        return value;
    }

    function activityIsCompleted(row, key, grades) {
        var module = activityModuleForKey(grades, key);
        var currentState = currentStateForKey(row, key);
        var value = numeric(row && row[key]);
        if (currentState !== null) {
            if (module === 'forum') {
                return currentState > 0;
            }
            return currentState > 0 || (value !== null && value > 0);
        }
        return value !== null && value > 0;
    }

    function findGradeRow(name, email, grades) {
        var n = lower(name);
        var e = lower(email);
        var rows = gradeRows(grades);
        return rows.find(function(row) {
            var rowName = lower(studentNameFromGrade(row));
            var rowEmail = lower(studentEmailFromGrade(row));
            return (e && rowEmail && e === rowEmail) || (n && rowName && n === rowName);
        }) || null;
    }

    function gradeInfo(name, email, grades) {
        var row = findGradeRow(name, email, grades);
        var keys = activityGradeKeys(grades);
        var launched = 0;
        if (row) {
            keys.forEach(function(key) {
                if (activityIsCompleted(row, key, grades)) {
                    launched++;
                }
            });
        }

        var total = null;
        var totalMax = null;
        if (row) {
            Object.keys(row).some(function(key) {
                var lk = lower(key);
                if (lk.indexOf('course total') >= 0 || lk.indexOf('total do curso') >= 0 || lk === 'total') {
                    var value = numeric(row[key]);
                    if (value !== null) {
                        total = value;
                        return true;
                    }
                }
                return false;
            });
            Object.keys(row).some(function(key) {
                var lk = lower(key);
                if (lk.indexOf('course total max') >= 0 || lk.indexOf('total do curso max') >= 0) {
                    var value = numeric(row[key]);
                    if (value !== null && value > 0) {
                        totalMax = value;
                        return true;
                    }
                }
                return false;
            });
        }

        var gradeScore = 0;
        if (total !== null) {
            gradeScore = totalMax ? clamp((total / totalMax) * 100) : clamp(total);
        }

        return {
            row: row,
            grade: total,
            gradeMax: totalMax,
            gradeScore: gradeScore,
            gradeItems: keys.length,
            gradeLaunched: launched,
            gradeLaunchScore: keys.length ? clamp((launched / keys.length) * 100) : 0
        };
    }

    function isCourseGeneral(context) {
        var value = lower(context);
        return !value || /^curso\s*:/.test(value) || /^course\s*:/.test(value) ||
            value === 'sistema' || value === 'system' || /^area de texto/.test(value) ||
            /^text area/.test(value) || /^midia/.test(value) || /^media/.test(value);
    }

    function contextName(log) {
        return norm(log.contextodoevento || log.context || log.eventcontext || log._resource || log._modtype);
    }

    function moduleName(log) {
        var module = lower(log && (log._modtype || log.modtype || log.module || log.modname));
        var component = lower(log && (log.component || log.componente));
        if (!module && component.indexOf('mod_') === 0) {
            module = component.replace(/^mod_/, '');
        }
        if (module === 'hvp') {
            module = 'h5pactivity';
        }
        return module;
    }

    /* Keep coverage aligned with the content dots shown in Turma. Generic
       Moodle contexts (reports, profiles, grades, etc.) are interactions,
       but they are not course resources and must not inflate the denominator. */
    function trackedContentKey(log, context) {
        var module = moduleName(log);
        var resources = {
            page: true,
            book: true,
            url: true,
            resource: true,
            folder: true,
            imscp: true
        };
        if (!resources[module]) {
            return '';
        }
        var cmid = parseInt(log && (log._cmid || log.cmid || log.contextinstanceid || 0), 10) || 0;
        return cmid ? 'cmid:' + cmid : module + ':' + lower(context);
    }

    function catalogItemIsOpen(item) {
        var now = Math.floor(Date.now() / 1000);
        if (String(item && item.available) === '0') {
            return false;
        }
        var from = Number(item && item.availablefrom || 0);
        var until = Number(item && item.availableuntil || 0);
        return (!from || from <= now) && (!until || until >= now);
    }

    function isSubmission(log) {
        var text = lower([
            log.nomedoevento,
            log.eventname,
            log.action,
            log.componente,
            log.component,
            log._modtype
        ].join(' '));
        return text.indexOf('submit') >= 0 || text.indexOf('submitted') >= 0 ||
            text.indexOf('submission') >= 0 || text.indexOf('upload') >= 0 ||
            text.indexOf('post created') >= 0 || text.indexOf('discussion created') >= 0 ||
            text.indexOf('attempt submitted') >= 0 || text.indexOf('graded') >= 0 ||
            text.indexOf('submetid') >= 0 || text.indexOf('envio') >= 0;
    }

    function calculateForStudent(name, email, logs, grades) {
        var allActivities = new Set();
        var studentActivities = new Set();
        var submittedActivities = new Set();
        var activeDays = new Set();
        var minDate = null;
        var maxDate = null;
        var lastDate = null;
        var interactions = 0;
        var targetName = lower(name);
        var targetEmail = lower(email);

        var config = Store && Store.getConfig ? Store.getConfig() : {};
        var hasResourceCatalog = false;
        (config.activitylinks || []).forEach(function(item) {
            if (item && item.tracked === false) {
                return;
            }
            var contentKey = trackedContentKey(item, item && item.name || '');
            if (contentKey) {
                hasResourceCatalog = true;
            }
            if (!catalogItemIsOpen(item)) {
                return;
            }
            if (contentKey) {
                allActivities.add(contentKey);
            }
        });

        (logs || []).forEach(function(log) {
            var activity = contextName(log);
            var contentKey = trackedContentKey(log, activity);
            var visibleContent = contentKey && (!hasResourceCatalog || allActivities.has(contentKey));
            if (visibleContent) {
                allActivities.add(contentKey);
            }

            var date = parseDate(log);
            if (date) {
                if (!minDate || date < minDate) {
                    minDate = date;
                }
                if (!maxDate || date > maxDate) {
                    maxDate = date;
                }
            }

            var logName = lower(log.nomecompleto || log.student_name || log.userfullname);
            var logEmail = lower(log.email);
            var isStudent = (targetEmail && logEmail && targetEmail === logEmail) || (targetName && logName && targetName === logName);
            if (!isStudent) {
                return;
            }

            interactions++;
            if (visibleContent) {
                studentActivities.add(contentKey);
            }
            if (date) {
                var dayKey = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
                activeDays.add(dayKey);
                if (!lastDate || date > lastDate) {
                    lastDate = date;
                }
            }
            if (activity && isSubmission(log)) {
                submittedActivities.add(lower(activity));
            }
        });

        var grade = gradeInfo(name, email, grades);
        var now = Date.now();
        var daysWithoutAccess = lastDate ? Math.max(0, Math.floor((now - lastDate.getTime()) / 86400000)) : null;
        var observedDays = minDate && maxDate ? Math.max(1, Math.floor((maxDate.getTime() - minDate.getTime()) / 86400000) + 1) : 1;
        var expectedActiveDays = Math.min(30, Math.max(7, observedDays));
        var activeDaysScore = clamp((activeDays.size / expectedActiveDays) * 100);
        var coverageScore = allActivities.size ? clamp((studentActivities.size / allActivities.size) * 100) : 100;
        var completionTarget = grade.gradeItems || allActivities.size || 1;
        var completedCount = grade.gradeItems ? grade.gradeLaunched : submittedActivities.size;
        var completionScore = clamp((Math.min(completedCount, completionTarget) / completionTarget) * 100);
        var interactionTarget = Math.max(10, (allActivities.size + grade.gradeItems) * 2);
        var interactionScore = clamp((interactions / interactionTarget) * 100);
        var participationScore = clamp((interactionScore * 0.70) + (activeDaysScore * 0.30));

        var score = clamp(
            coverageScore * 0.30 +
            completionScore * 0.35 +
            grade.gradeLaunchScore * 0.25 +
            participationScore * 0.10
        );

        if (coverageScore >= 100 && completionScore >= 100 &&
                (grade.gradeItems === 0 || grade.gradeLaunchScore >= 100) && interactions > 0) {
            score = 100;
        }

        if (!completedCount && !grade.gradeLaunched && !grade.gradeScore) {
            var browseOnlyScore = interactions
                ? Math.min(12, 2 + (activeDays.size * 2) + Math.min(interactions, 20) * 0.25)
                : 0;
            score = Math.min(score, Math.round(browseOnlyScore));
        }

        return {
            score: score,
            grade: grade.grade,
            gradeMax: grade.gradeMax,
            gradeScore: grade.gradeScore,
            gradeItems: grade.gradeItems,
            gradeLaunched: grade.gradeLaunched,
            gradeProgress: grade.gradeLaunchScore,
            completion: completionScore,
            coverage: coverageScore,
            activeDays: activeDays.size,
            activeDaysScore: activeDaysScore,
            interactionScore: interactionScore,
            participationScore: participationScore,
            last: lastDate,
            daysWithoutAccess: daysWithoutAccess,
            interactions: interactions,
            submittedActivities: submittedActivities.size
        };
    }

    function getStudentNames(logs, grades) {
        var seen = {};
        var names = [];
        function add(name) {
            name = norm(name);
            var key = lower(name);
            if (name && !seen[key]) {
                seen[key] = true;
                names.push(name);
            }
        }
        (logs || []).forEach(function(log) {
            add(log.nomecompleto || log.student_name || log.userfullname);
        });
        gradeRows(grades).forEach(function(row) {
            add(studentNameFromGrade(row));
        });
        return names;
    }

    return {
        calculateForStudent: calculateForStudent,
        getStudentNames: getStudentNames,
        parseDate: parseDate
    };
});
