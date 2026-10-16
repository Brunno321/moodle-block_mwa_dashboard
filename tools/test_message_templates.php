<?php
if (PHP_SAPI !== 'cli') {
    exit;
}
// Language-only regression: no Moodle bootstrap, database, cache or message sending.
define('MOODLE_INTERNAL', true);
$root = dirname(__DIR__);
$kinds = ['never', 'eng', 'inactive', 'task', 'difficulty', 'other', 'praise'];
$failed = 0;
$catalogs = [];
foreach (['en', 'es', 'es_mx', 'pt_br'] as $language) {
    $string = [];
    require($root . '/lang/' . $language . '/block_mwa_dashboard.php');
    $catalogs[$language] = $string;
}
foreach (['es', 'es_mx', 'pt_br'] as $language) {
    $checked = 0;
    // external returns JSON inside a JSON response; the client parses strings once.
    $response = json_decode(json_encode(['strings' => json_encode($catalogs[$language])]), true);
    $clientstrings = json_decode($response['strings'], true);
    foreach ($kinds as $kind) {
        foreach (['subject', 'body'] as $part) {
            $key = 'tpl_' . $kind . '_' . $part;
            $value = $catalogs[$language][$key] ?? '';
            $valid = $value !== '' && ($language === 'pt_br' ? $value !== $catalogs['es'][$key] && $value !== $catalogs['en'][$key] : $value === $catalogs['es'][$key]);
            if ($part === 'body') {
                $valid = $valid && strpos($value, $language === 'pt_br' ? 'Olá {nome},' : 'Hola {nome},') === 0 &&
                    strpos($value, "\n\n") !== false && strpos($value, '\n') === false;
                $valid = $valid && $clientstrings[$key] === $value &&
                    strpos($clientstrings[$key], "\n\n") !== false;
            }
            preg_match_all('/\{\$a(?:->\w+)?\}|\{[A-Za-z]\w*\}/', $catalogs['en'][$key], $expected);
            preg_match_all('/\{\$a(?:->\w+)?\}|\{[A-Za-z]\w*\}/', $value, $actual);
            sort($expected[0]);
            sort($actual[0]);
            $valid = $valid && $expected[0] === $actual[0];
            if (!$valid) { echo "FAIL {$language}:{$key}\n"; $failed++; }
            $checked++;
        }
    }
    $literal = array_keys(array_filter($catalogs[$language], function($value) {
        return strpos($value, '\n') !== false;
    }));
    if ($literal) {
        echo 'FAIL literal backslash-n in ' . $language . ': ' . implode(', ', $literal) . PHP_EOL;
        $failed++;
    }
    echo "{$language}: {$checked} templates checked; " . count($literal) . " literal backslash-n strings\n";
}
echo "Message templates: {$failed} errors\n";
exit($failed ? 1 : 0);
