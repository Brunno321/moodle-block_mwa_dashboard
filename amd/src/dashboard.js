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
 * AMD entry point for the MWA Analytics Dashboard block.
 *
 * @module     block_mwa_dashboard/dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([
    'core/ajax',
    'core/log',
    'block_mwa_dashboard/dashboardstore',
    'block_mwa_dashboard/dashboardapp'
], function(Ajax, Log, Store, DashboardApp) {

    'use strict';

    
    var callAction = function(method, args) {
        var calls = Ajax.call([{
            methodname: method,
            args: args || {}
        }]);
        return calls[0];
    };
    var lastLoadAt = 0;
    var activeLoad = null;
    var dataReady = null;

    
    var deliverError = function(err) {
        var dashboard = Store.getModule('MWADashboard');
        var message = (err && err.message) ? err.message : String(err || 'Data load failed');
        if (dashboard && typeof dashboard.receiveError === 'function') {
            dashboard.receiveError(message);
        }
    };

    
    var loadAndDeliver = function(courseid, groupid) {
        if (activeLoad) {
            return activeLoad;
        }
        var calls = Ajax.call([
            {
                methodname: 'block_mwa_dashboard_get_logs',
                args: {courseid: courseid, since: 0, groupid: groupid || 0}
            },
            {
                methodname: 'block_mwa_dashboard_get_grades',
                args: {courseid: courseid, groupid: groupid || 0}
            }
        ]);

        var safeCall = function(call, endpoint) {
            return call.then(function(result) {
                var value=result||{};
                if(!value.logs&&endpoint==='block_mwa_dashboard_get_logs'){
                    console.error('[MWA Dashboard] Empty logs response:',{endpoint:endpoint,courseid:courseid,groupid:groupid,response:value});
                }
                if(!value.grades&&endpoint==='block_mwa_dashboard_get_grades'){
                    console.error('[MWA Dashboard] Empty grades response:',{endpoint:endpoint,courseid:courseid,groupid:groupid,response:value});
                }
                return {ok: true, value: value};
            }).catch(function(error) {
                console.error('[MWA Dashboard] AJAX endpoint failed:',endpoint,{courseid:courseid,groupid:groupid,error:error});
                Log.error('block_mwa_dashboard/dashboard: one data source failed: '+endpoint);
                Log.error(error);
                return {ok: false, value: {}, error: error, endpoint:endpoint};
            });
        };
        activeLoad = Promise.all([
            safeCall(calls[0],'block_mwa_dashboard_get_logs'),
            safeCall(calls[1],'block_mwa_dashboard_get_grades')
        ]).then(function(results) {
            var dashboard = Store.getModule('MWADashboard');
            var logsResult = results[0].value;
            var gradesResult = results[1].value;

            if (dashboard && typeof dashboard.receiveData === 'function') {
                dashboard.receiveData({
                    type: 'mwa-data',
                    logs: logsResult.logs || '[]',
                    logsCount: logsResult.count || 0,
                    grades: gradesResult.grades || '[]',
                    gradesCount: gradesResult.count || 0
                });
            }
            if (!results[0].ok && !results[1].ok) {
                deliverError(results[0].error || results[1].error);
            }
            lastLoadAt = Date.now();
            return results;
        }).then(function(results) {
            activeLoad = null;
            return results;
        });
        return activeLoad;
    };

    var init = function(params) {
        params = params || {};
        var config = params.config || {};
        var root = document.getElementById('block-mwa-dashboard-app');
        var domcourseid = root && root.getAttribute('data-courseid');
        var courseid = params.courseid ? parseInt(params.courseid, 10) :
            parseInt(config.courseid || domcourseid || 0, 10);
        var groupid = parseInt(config.groupid || 0, 10);
        try {
            groupid = parseInt(new URL(window.location.href).searchParams.get('group') || groupid, 10) || 0;
        } catch (error) {
            console.error('[MWA Dashboard] Could not read group from URL:', error);
        }
        if (!courseid || courseid <= 0) {
            console.error('[MWA Dashboard] Invalid course id before AJAX requests:', {
                paramsCourseid: params.courseid,
                configCourseid: config.courseid,
                domCourseid: domcourseid,
            });
        }

        var bootstrap = callAction('block_mwa_dashboard_get_dashboard_strings', {courseid: courseid})
            .then(function(result) {
                var strings = {};
                try {
                    strings = JSON.parse(result.strings || '{}');
                } catch (error) {
                    console.error('[MWA Dashboard] Could not parse localized strings:', error);
                }
                config.courseid = courseid;
                config.groupid = groupid;
                config.language = result.language || 'es_mx';
                config.locale = result.locale || 'es-MX';
                config.timezone = result.timezone || 'America/Merida';
                config.reasonaliases = JSON.parse(result.reasonaliases || '{}');
                Store.configure(config, strings, callAction);
                DashboardApp.init(config);
            })
            .catch(function(error) {
                console.error('[MWA Dashboard] String/config bootstrap failed:', error);
                Store.configure(config, params.strings || {}, callAction);
                DashboardApp.init(config);
            });

        var refreshDashboardData = function(forceFresh) {
            if (courseid <= 0) {
                return Promise.resolve();
            }
            if (forceFresh && activeLoad) {
                return activeLoad.then(function() {
                    return loadAndDeliver(courseid, groupid);
                });
            }
            return loadAndDeliver(courseid, groupid);
        };

        var groupFilter = document.getElementById('mwaGroupFilter');
        if (groupFilter) {
            groupFilter.addEventListener('change', function() {
                var url = new URL(window.location.href);
                url.searchParams.set('group', groupFilter.value || '0');
                window.location.assign(url.toString());
            });
        }

        bootstrap.then(function() {
            refreshDashboardData();
        });

        
        window.MWAReloadData = refreshDashboardData;

        window.MWAEnsureDashboardData = function() {
            var dashboard = Store.getModule('MWADashboard');
            var state = dashboard && dashboard.state ? dashboard.state : {};
            var hasData = (state.logs && state.logs.length) ||
                (state.grades && state.grades.length) ||
                (state.students && state.students.length);
            if (hasData) {
                return Promise.resolve(true);
            }
            if (!dataReady) {
                dataReady = refreshDashboardData(true).then(function() {
                    var current = Store.getModule('MWADashboard');
                    var currentState = current && current.state ? current.state : {};
                    return !!((currentState.logs && currentState.logs.length) ||
                        (currentState.grades && currentState.grades.length) ||
                        (currentState.students && currentState.students.length));
                }).finally(function() {
                    dataReady = null;
                });
            }
            return dataReady;
        };

        setTimeout(function() {
            window.addEventListener('pageshow', function(event) {
                if (event.persisted || Date.now() - lastLoadAt > 30000) {
                    refreshDashboardData();
                }
            });
        }, 1000);
    };

    return {
        init: init
    };
});
