<?php
namespace block_mwa_dashboard;
defined('MOODLE_INTERNAL') || die();

/** Stable intervention identifiers with one shared historical dictionary. */
class compatibility {
    public static function reason_aliases(): array {
        static $aliases;
        if ($aliases === null) {
            $aliases = json_decode(file_get_contents(__DIR__ . '/../data/reason_aliases.json'), true);
        }
        return $aliases;
    }

    public static function reason_code(string $value): string {
        $value = \core_text::strtolower(trim(preg_replace('/\s*\[(moodle|email)\]\s*$/i', '', $value)));
        $value = strtr($value, ['á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a', 'é' => 'e',
            'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
        if (in_array($value, ['never', 'low', 'pending', 'difficult', 'other'], true)) {
            return $value;
        }
        return self::reason_aliases()[$value] ?? 'other';
    }
}
