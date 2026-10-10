/**
 * Русская типографика для строк из content.ts:
 *  — неразрывный пробел после коротких предлогов, союзов и местоимений;
 *  — неразрывный пробел перед тире и между числом и словом;
 *  — мини-разметка: *курсив*, ==маркер==.
 */
const NBSP = ' ';
const SHORT =
  'в|во|и|а|но|к|ко|с|со|у|о|об|обо|от|до|на|по|за|из|не|ни|для|без|при|про|под|над|что|как|я|мы|вы|ты|он|она|их|её|или|да|это';
const AFTER_SHORT = new RegExp(`(?<=^|[\\s${NBSP}(«„"])(${SHORT}) (?=\\S)`, 'giu');
const BEFORE_PARTICLE = / (?=(же|бы|ли)(?=[\s.,!?…]|$))/gu;

export function typo(input: string): string {
  return input
    .replace(AFTER_SHORT, `$1${NBSP}`)
    .replace(BEFORE_PARTICLE, NBSP)
    .replace(/ —/g, `${NBSP}—`)
    .replace(/(\d) (?=[\p{L}₽%])/gu, `$1${NBSP}`)
    .replace(/№ /g, `№${NBSP}`);
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML-строка для set:html: экранирование + типографика + мини-разметка. */
export function rich(input: string): string {
  return typo(escape(input))
    .replace(/==(.+?)==/g, '<mark class="hl"><span>$1</span></mark>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** Текст без разметки (для alt, meta, aria-label). */
export function plain(input: string): string {
  return typo(input.replace(/==|\*/g, ''));
}

/** 1 балл, 2 балла, 5 баллов */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
