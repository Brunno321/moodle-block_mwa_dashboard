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
 * @module     block_mwa_dashboard/dashboardstore
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function() {

    'use strict';

    var config = {};
    var strings = {};
    var dashboard = null;
    var actionCaller = null;
    var modules = {};
    var handlers = {};
    var legacy = {};
    var facade = null;

    var configure = function(newConfig, newStrings, caller) {
        config = newConfig || {};
        strings = newStrings || {};
        actionCaller = caller || null;
    };

    var register = function(name, api) {
        modules[name] = api;
        if (name !== 'MWADashboard') {
            window[name] = api;
        }
        return api;
    };

    var getModule = function(name) {
        return modules[name] || null;
    };

    var getStrings = function() {
        return strings;
    };

    var getConfig = function() {
        return config;
    };

    var setDashboard = function(api) {
        dashboard = api;
        modules.MWADashboard = api;
        return api;
    };

    var callAction = function(method, args) {
        if (!actionCaller) {
            return Promise.reject(new Error('Dashboard AJAX bridge is not available.'));
        }
        return actionCaller(method, args || {});
    };

    var setHandler = function(name, handler) {
        handlers[name] = handler;
        if (name === 'showPage' || name === 'markSeen' || name === 'toggleSelectPriority' || name === 'openBulkEmail') {
            window[name] = handler;
        }
        return handler;
    };

    var clearElement = function(element) {
        if (element && element.replaceChildren) {
            element.replaceChildren();
        } else if (element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }
    };

    var renderHtml = function(element, html) {
        if (!element) {
            return;
        }
        clearElement(element);
        var tag = element.tagName ? element.tagName.toLowerCase() : '';
        var wrapped = html;
        // DOMParser drops <tr>/<td>/<th> outside a table context — wrap them.
        if (tag === 'tbody' || tag === 'thead') {
            wrapped = '<table><tbody>' + html + '</tbody></table>';
        } else if (tag === 'tr') {
            wrapped = '<table><tbody><tr>' + html + '</tr></tbody></table>';
        }
        var doc = new DOMParser().parseFromString(String(wrapped || ''), 'text/html');
        var src = (tag === 'tbody' || tag === 'thead')
            ? doc.querySelector('tbody')
            : doc.body;
        if (!src) { return; }
        while (src.firstChild) {
            element.appendChild(document.importNode(src.firstChild, true));
            src.removeChild(src.firstChild);
        }
    };

    var callHandler = function(name) {
        var handler = handlers[name];
        if (typeof handler === 'function') {
            return handler.apply(null, Array.prototype.slice.call(arguments, 1));
        }
        return null;
    };

    var bindDomEvents = function(root) {
        if (!root || root.dataset.mwaEventsBound === '1') {
            return;
        }
        root.dataset.mwaEventsBound = '1';
        root.addEventListener('click', function(e) {
            var pageButton = e.target.closest('[data-action-page]');
            if (pageButton && root.contains(pageButton)) {
                e.preventDefault();
                callHandler('showPage', pageButton.getAttribute('data-action-page'));
                return;
            }
            var actionButton = e.target.closest('[data-mwa-action]');
            if (!actionButton || !root.contains(actionButton)) {
                return;
            }
            e.preventDefault();
            var action = actionButton.getAttribute('data-mwa-action');
            if (action === 'mark-seen') {
                callHandler('markSeen');
            } else if (action === 'toggle-select-priority') {
                callHandler('toggleSelectPriority');
            } else if (action === 'open-bulk-email') {
                callHandler('openBulkEmail');
            } else if (action === 'classlist-toggle') {
                var classList = getModule('MWAClassList');
                if (classList) {
                    classList.toggle();
                }
            } else if (action === 'activity-filter') {
                var activities = getModule('MWAActivities');
                if (activities) {
                    activities.setFilter(actionButton.getAttribute('data-filter'), actionButton);
                }
            } else if (action === 'send-selected-intervention') {
                var interventions = getModule('MWAInterventions');
                if (interventions) {
                    interventions.sendToSelected();
                }
            }
        });
        root.addEventListener('change', function(e) {
            if (e.target && e.target.id === 'clSort') {
                var classList = getModule('MWAClassList');
                if (classList) {
                    classList.render();
                }
            } else if (e.target && e.target.id === 'spStudentSel') {
                var profile = getModule('MWAProfile');
                if (profile) {
                    profile.loadProfile(e.target.value);
                }
            }
        });
        root.addEventListener('input', function(e) {
            if (e.target && e.target.id === 'clSearch') {
                var classList = getModule('MWAClassList');
                if (classList) {
                    classList.filter(e.target.value);
                }
            }
        });
    };

    var defineFacadeProperty = function(obj, name, getter, setter) {
        Object.defineProperty(obj, name, {
            configurable: true,
            enumerable: false,
            get: getter,
            set: setter || function(value) { legacy[name] = value; }
        });
    };

    var windowFacade = function() {
        if (facade) {
            return facade;
        }
        facade = {};
        defineFacadeProperty(facade, 'MWADashboard', function() { return dashboard; }, setDashboard);
        ['MWAActionCenter', 'MWAAlerts', 'MWAClassList', 'MWAProfile', 'MWAActivities', 'MWAGrades', 'MWAInterventions', 'MWAEngagement', 'MWAContent', 'MWAPersonalised', 'MWAChat'].forEach(function(name) {
            defineFacadeProperty(facade, name, function() { return modules[name]; }, function(value) { register(name, value); });
        });
        ['MWA_GRADE_CACHE', 'MWA_ACT_NAMES', 'MWA_ACT_CMIDS', 'MWA_ACT_MODULES', 'MWA_NOTES', 'MWA_CONTACTS', 'mwaRetentionChart'].forEach(function(name) {
            defineFacadeProperty(facade, name, function() { return legacy[name]; }, function(value) { legacy[name] = value; });
        });
        defineFacadeProperty(facade, 'Chart', function() { return window.Chart; });
        defineFacadeProperty(facade, 'showPage', function() { return handlers.showPage; }, function(value) { handlers.showPage = value; });
        defineFacadeProperty(facade, 'markSeen', function() { return handlers.markSeen; }, function(value) { handlers.markSeen = value; });
        defineFacadeProperty(facade, 'toggleSelectPriority', function() { return handlers.toggleSelectPriority; }, function(value) { handlers.toggleSelectPriority = value; });
        defineFacadeProperty(facade, 'openBulkEmail', function() { return handlers.openBulkEmail; }, function(value) { handlers.openBulkEmail = value; });
        facade.location = window.location;
        facade.parent = window.parent;
        return facade;
    };

    return {
        configure: configure,
        register: register,
        getModule: getModule,
        getStrings: getStrings,
        getConfig: getConfig,
        setDashboard: setDashboard,
        callAction: callAction,
        setHandler: setHandler,
        callHandler: callHandler,
        clearElement: clearElement,
        renderHtml: renderHtml,
        bindDomEvents: bindDomEvents,
        windowFacade: windowFacade
    };
});
