<?php
// Isolated tests: no Moodle bootstrap, database, mail or network connections.
define('MOODLE_INTERNAL', true);
class core_text {
    public static function strtolower($text) { return mb_strtolower($text, 'UTF-8'); }
}
$testconfig = [];
$testlanguage = 'es_mx';
function get_config($component, $name) { global $testconfig; return $testconfig[$name] ?? false; }
function current_language() { global $testlanguage; return $testlanguage; }
$string = [];
require(__DIR__ . '/../lang/es_mx/block_mwa_dashboard.php');
function get_string($key, $component) {
    global $string;
    if (!isset($string[$key])) { throw new RuntimeException('Missing translation: ' . $key); }
    return $string[$key];
}
require(__DIR__ . '/../classes/api.php');
require(__DIR__ . '/../classes/compatibility.php');
$passed = 0;
$failed = 0;
function check($name, $actual, $expected) {
    global $passed, $failed;
    if ($actual === $expected) { $passed++; echo 'PASS ' . $name . PHP_EOL; }
    else { $failed++; echo 'FAIL ' . $name . ': ' . json_encode([$actual, $expected]) . PHP_EOL; }
}
check('Default timezone', \block_mwa_dashboard\api::display_timezone(), 'America/Merida');
$testconfig['displaytimezone'] = 'Invalid/Zone';
check('Invalid timezone fallback', \block_mwa_dashboard\api::display_timezone(), 'America/Merida');
$testconfig['displaytimezone'] = 'UTC';
check('Configured timezone', \block_mwa_dashboard\api::display_timezone(), 'UTC');
foreach (['es' => 'es-MX', 'es_mx' => 'es-MX', 'en' => 'en', 'pt_br' => 'pt-br'] as $language => $locale) {
    $testlanguage = $language;
    check('Locale ' . $language, \block_mwa_dashboard\api::display_locale(), $locale);
}
foreach (\block_mwa_dashboard\compatibility::reason_aliases() as $label => $code) {
    check('Reason ' . $label, \block_mwa_dashboard\compatibility::reason_code($label), $code);
}
foreach (['Pendência acadêmica', 'Academic pending work', 'Tarea pendiente [email]'] as $label) {
    check('Localized reason ' . $label, \block_mwa_dashboard\compatibility::reason_code($label), 'pending');
}
check('Unknown reason', \block_mwa_dashboard\compatibility::reason_code('custom'), 'other');
$component = new ReflectionMethod(\block_mwa_dashboard\api::class, 'translate_component');
$action = new ReflectionMethod(\block_mwa_dashboard\api::class, 'translate_action');
check('Assignment label', $component->invoke(null, 'mod_assign'), 'Tarea');
check('Viewed action label', $action->invoke(null, 'viewed', 'mod_page'), 'Módulo del curso visualizado');
check('Unknown component label', $component->invoke(null, 'mod_unknown'), get_string('other', 'block_mwa_dashboard'));
check('Unknown action label', $action->invoke(null, 'unknown', 'mod_page'), get_string('other', 'block_mwa_dashboard'));
echo "PHP isolated contracts: {$passed} passed, {$failed} failed" . PHP_EOL;
exit($failed ? 1 : 0);
