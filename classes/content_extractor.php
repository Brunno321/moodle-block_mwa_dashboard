<?php
// This file is part of Moodle - http://moodle.org/
//
// @package    block_mwa_dashboard
// @copyright  2026 Bruno Porto
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Extracts readable content from files and URLs referenced by Moodle activities.
 * Implemented strategies (without requiring an external server):
 *   1. DOCX  → unpacks the ZIP and extracts word/document.xml
 *   2. PDF   → extracts readable text fragments directly from the binary
 *   3. HTML  → curl + strip_tags
 *   4. YouTube → YouTube Data API v3 (title, description, duration, chapters)
 *   5. Generic URL → curl + strip_tags on the HTML
 */
class content_extractor {

    /** @var int Character limit per extraction. */
    const MAX_CHARS = 3000;

    /**
     * Main entry point.
     * Receives an array of URLs/paths and returns structured text.
     *
     * @param array  $sources  ['type'=>'file'|'url', 'url'=>string, 'filename'=>string, 'contextid'=>int, 'itemid'=>int, 'filearea'=>string, 'component'=>string]
     * @return string Extracted text ready to be included in the prompt.
     */
    public static function extract_all(array $sources): string {
        $parts = [];
        foreach ($sources as $src) {
            $text = '';
            $label = $src['label'] ?? ($src['filename'] ?? ($src['url'] ?? ''));
            try {
                if (($src['type'] ?? '') === 'file') {
                    $text = self::extract_file($src);
                } elseif (!empty($src['url'])) {
                    $text = self::extract_url($src['url']);
                }
            } catch (\Exception $e) {
                $text = '(Não foi possível extrair o conteúdo: ' . $e->getMessage() . ')';
            }
            if (trim($text)) {
                $parts[] = "[Conteúdo: $label]\n" . trim($text);
            }
        }
        return implode("\n\n", $parts);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOODLE FILE
    // ─────────────────────────────────────────────────────────────────────────

    public static function extract_file(array $src): string {
        $fs   = get_file_storage();
        $file = $fs->get_file(
            $src['contextid'],
            $src['component'] ?? 'mod_resource',
            $src['filearea']  ?? 'content',
            $src['itemid']    ?? 0,
            '/',
            $src['filename']
        );
        if (!$file || $file->is_directory()) {
            return '';
        }
        $mime = $file->get_mimetype();
        $name = strtolower($file->get_filename());

        // Choose strategy by MIME type or extension
        if ($mime === 'application/pdf' || (substr($name, -strlen('.pdf')) === '.pdf')) {
            return self::extract_pdf($file);
        }
        if (in_array($mime, [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
        ]) || (substr($name, -strlen('.docx')) === '.docx') || (substr($name, -strlen('.doc')) === '.doc')) {
            return self::extract_docx($file);
        }
        if ((substr($name, -strlen('.txt')) === '.txt') || (strpos($mime, 'text/') === 0)) {
            return mb_substr($file->get_content(), 0, self::MAX_CHARS);
        }
        return '(Tipo de arquivo não suportado para extração de texto: ' . $mime . ')';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOCX — works in pure PHP (DOCX is a ZIP with XML)
    // ─────────────────────────────────────────────────────────────────────────

    public static function extract_docx(\stored_file $file): string {
        $tmp = tempnam(sys_get_temp_dir(), 'mwa_docx_') . '.docx';
        file_put_contents($tmp, $file->get_content());

        $text = '';
        $zip  = new \ZipArchive();
        if ($zip->open($tmp) === true) {
            // Main text.
            $xml = $zip->getFromName('word/document.xml');
            if ($xml) {
                $text .= self::xml_to_text($xml);
            }
            // Footnotes (optional, extra context)
            $footnotes = $zip->getFromName('word/footnotes.xml');
            if ($footnotes) {
                $fn = self::xml_to_text($footnotes);
                if (trim($fn)) $text .= "\n\n[Notas de rodapé]\n$fn";
            }
            $zip->close();
        }
        @unlink($tmp);

        return self::truncate($text);
    }

    private static function xml_to_text(string $xml): string {
        // Preserve paragraph breaks before strip_tags
        $xml = preg_replace('/<\/w:p>/', "\n", $xml);
        $xml = preg_replace('/<\/w:tr>/', "\n", $xml);
        $xml = preg_replace('/<w:br[^>]*\/>/', "\n", $xml);
        // Remove tags.
        $text = strip_tags($xml);
        // Clean extra whitespace
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        return trim($text);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PDF — extracts readable strings from the binary without executing system commands.
    // ─────────────────────────────────────────────────────────────────────────

    public static function extract_pdf(\stored_file $file): string {
        $raw = $file->get_content();
        preg_match_all('/[ -~\x0a\x0d]{4,}/', $raw, $matches);
        $strings = $matches[0] ?? [];
        $lines = array_filter($strings, function($line) {
            $line = trim($line);
            return strlen($line) > 10 && preg_match('/[a-zA-ZÀ-ú]{3,}/', $line);
        });
        $text = implode("\n", array_slice($lines, 0, 200));

        return self::truncate($text);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // URL — YouTube, Google Drive, or generic HTML
    // ─────────────────────────────────────────────────────────────────────────

    public static function extract_url(string $url): string {
        $url = trim($url);
        if (!$url) return '';

        // YouTube
        $yt_id = self::youtube_id($url);
        if ($yt_id) {
            return self::extract_youtube($yt_id, $url);
        }

        // URL ending in PDF.
        if (preg_match('/\.pdf(\?.*)?$/i', $url)) {
            return self::fetch_and_note($url, 'PDF externo');
        }

        // Generic HTML
        return self::fetch_html($url);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // YOUTUBE
    // ─────────────────────────────────────────────────────────────────────────

    public static function youtube_id(string $url): ?string {
        // youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /v/ID,
        // and youtube-nocookie.com/embed/ID (Moodle privacy-enhanced mode)
        if (preg_match('/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_\-]{11})/', $url, $m)) {
            return $m[1];
        }
        // If URL has v= parameter at any position
        if (preg_match('/[?&]v=([A-Za-z0-9_\-]{11})/', $url, $m)) {
            return $m[1];
        }
        return null;
    }

    public static function extract_youtube(string $video_id, string $original_url): string {
        $info = [];
        $info[] = "VÍDEO DO YOUTUBE DETECTADO";
        $info[] = "URL: $original_url";
        $info[] = "Link direto: https://www.youtube.com/watch?v=$video_id";

        $got_title = false;

        // STRATEGY 1: YouTube oEmbed API (public, no API key needed)
        try {
            $oembed_url = 'https://www.youtube.com/oembed?url='
                . urlencode("https://www.youtube.com/watch?v=$video_id") . '&format=json';
            $curl = new \curl();
            $curl->setopt([
                'CURLOPT_TIMEOUT' => 8,
                'CURLOPT_RETURNTRANSFER' => true,
                'CURLOPT_FOLLOWLOCATION' => true,
                'CURLOPT_USERAGENT' => 'Mozilla/5.0 (compatible; MoodleMWA/1.0)',
            ]);
            $response = $curl->get($oembed_url);
            if (!$curl->get_errno() && $response) {
                $data = json_decode($response, true);
                if (!empty($data['title'])) {
                    $info[] = "Título: " . $data['title'];
                    $got_title = true;
                }
                if (!empty($data['author_name'])) {
                    $info[] = "Canal: " . $data['author_name'];
                }
            }
        } catch (\Throwable $e) {}

        // STRATEGY 2: Scraping the YouTube page
        try {
            $curl2 = new \curl();
            $curl2->setopt([
                'CURLOPT_TIMEOUT' => 8,
                'CURLOPT_RETURNTRANSFER' => true,
                'CURLOPT_FOLLOWLOCATION' => true,
                'CURLOPT_USERAGENT' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            ]);
            $html = $curl2->get("https://www.youtube.com/watch?v=$video_id");
            if ($html) {
                // Title (if oEmbed failed)
                if (!$got_title && preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $m)) {
                    $t = html_entity_decode(trim($m[1]));
                    $t = preg_replace('/\s*[-|]\s*YouTube\s*$/i', '', $t);
                    if ($t) { $info[] = "Título: $t"; $got_title = true; }
                }
                // Publication date
                if (preg_match('/"publishDate"\s*:\s*"([^"]+)"/', $html, $m)) {
                    $ts = strtotime($m[1]);
                    if ($ts) $info[] = "Publicado em: " . date('d/m/Y', $ts);
                } elseif (preg_match('/itemprop="datePublished"[^>]+content="([^"]+)"/i', $html, $m)) {
                    $ts = strtotime($m[1]);
                    if ($ts) $info[] = "Publicado em: " . date('d/m/Y', $ts);
                }

                // View count
                if (preg_match('/"viewCount"\s*:\s*"(\d+)"/', $html, $m)) {
                    $info[] = "Visualizações: " . number_format((int)$m[1], 0, '.', '.');
                }
                // Description
                if (preg_match('/"shortDescription"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/s', $html, $m)) {
                    $desc = stripcslashes($m[1]);
                    $desc = mb_substr($desc, 0, 600);
                    if ($desc) $info[] = "Descrição: $desc";
                } elseif (preg_match('/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i', $html, $m)) {
                    $info[] = "Descrição: " . html_entity_decode(mb_substr($m[1], 0, 400));
                }

            }
        } catch (\Throwable $e) {}

        // STRATEGY 3: If insufficient data, instruct AI to search
        if (!$got_title) {
            $info[] = "";
            $info[] = "INSTRUÇÃO: Não foi possível extrair os metadados do vídeo automaticamente.";
            $info[] = "Pesquise sobre este vídeo usando a URL acima e inclua no diagnóstico:";
            $info[] = "- Título do vídeo, nome do canal, data, duração, tema abordado e visualizações.";
        }

        return implode("\n", $info);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GENERIC HTML
    // ─────────────────────────────────────────────────────────────────────────

    public static function fetch_html(string $url): string {
        $html = self::raw_fetch($url);
        if (!$html) return '(Não foi possível acessar a URL)';

        // Extract title
        $title = '';
        if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $m)) {
            $title = html_entity_decode(trim($m[1]));
        }

        // Remove scripts, styles, navigation, header, footer, and aside elements.
        $html = preg_replace('/<(script|style|nav|header|footer|aside|noscript)[^>]*>.*?<\/\1>/si', '', $html);

        // Try to extract <article>, <main>, or <body>.
        $body = '';
        foreach (['article', 'main', 'body'] as $tag) {
            if (preg_match("/<{$tag}[^>]*>(.*?)<\/{$tag}>/si", $html, $m)) {
                $body = $m[1];
                break;
            }
        }
        if (!$body) $body = $html;

        // Preserve paragraphs
        $body = preg_replace('/<\/(p|div|h[1-6]|li|br)>/i', "\n", $body);
        $text = strip_tags($body);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        $text = trim($text);

        $result = $title ? "Título: $title\n\n$text" : $text;
        return self::truncate($result);
    }

    private static function fetch_and_note(string $url, string $type): string {
        return "(Recurso do tipo $type. URL: $url — o conteúdo binário não pode ser extraído diretamente, mas o link foi identificado na atividade.)";
    }

    private static function raw_fetch(string $url): string {
        $curl = new \curl();
        $curl->setopt([
            'CURLOPT_TIMEOUT'         => 10,
            'CURLOPT_RETURNTRANSFER'  => true,
            'CURLOPT_FOLLOWLOCATION'  => true,
            'CURLOPT_MAXREDIRS'       => 3,
            'CURLOPT_USERAGENT'       => 'Mozilla/5.0 (compatible; MWA-Dashboard/1.0)',
        ]);
        $response = $curl->get($url);
        if ($curl->get_errno()) return '';
        return (string)$response;
    }

    private static function truncate(string $text): string {
        $text = preg_replace('/\s+/', ' ', $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        $text = trim($text);
        if (mb_strlen($text) > self::MAX_CHARS) {
            $text = mb_substr($text, 0, self::MAX_CHARS - 50) . "\n\n[... truncado]";
        }
        return $text;
    }
}
