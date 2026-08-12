// This file is part of Moodle - http://moodle.org/.

/**
 * Keep the AI model selector limited to the selected official provider.
 *
 * @module     block_mwa_dashboard/adminai
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function() {
    'use strict';

    var MODELS = {
        deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        openai: ['gpt-4.1-mini', 'gpt-4.1'],
        gemini: ['gemini-3.5-flash'],
        anthropic: ['claude-sonnet-4-6', 'claude-sonnet-5'],
        institutional: []
    };

    function init() {
        var provider = document.getElementById('id_s_block_mwa_dashboard_ia_provider');
        var model = document.getElementById('id_s_block_mwa_dashboard_ia_model');
        var institutionalIds = [
            'id_s_block_mwa_dashboard_ia_institutional_url',
            'id_s_block_mwa_dashboard_ia_institutional_model',
            'id_s_block_mwa_dashboard_ia_institutional_private'
        ];
        if (!provider || !model) {
            return;
        }

        function refreshModels() {
            var allowed = MODELS[provider.value] || [];
            Array.prototype.forEach.call(model.options, function(option) {
                var visible = option.value === 'recommended' || allowed.indexOf(option.value) !== -1;
                option.hidden = !visible;
                option.disabled = !visible;
            });
            if (model.value !== 'recommended' && allowed.indexOf(model.value) === -1) {
                model.value = 'recommended';
            }
            institutionalIds.forEach(function(id) {
                var field = document.getElementById(id);
                var row = field && (field.closest('.form-item') || field.closest('.form-group'));
                if (row) {
                    row.hidden = provider.value !== 'institutional';
                }
            });
        }

        provider.addEventListener('change', refreshModels);
        refreshModels();
    }

    return {init: init};
});
