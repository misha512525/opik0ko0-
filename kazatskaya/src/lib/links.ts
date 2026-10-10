import { DEFAULT_MESSAGE, LINKS } from '@/content/content';

/** Неразрешённый плейсхолдер вида {{ИМЯ}} */
export const isPlaceholder = (value?: string | null) => !value || value.includes('{{');

/** Показывать TODO-плейсхолдеры с красной обводкой (только для редактуры) */
export const SHOW_TODO = import.meta.env.PUBLIC_SHOW_TODO === '1';

/**
 * Ссылка «написать в Telegram» с предзаполненным текстом.
 * Telegram поддерживает ?text= для публичных username; если клиент его проигнорирует — просто откроется чат.
 */
export function tg(text: string = DEFAULT_MESSAGE): string {
  return `${LINKS.contact}?text=${encodeURIComponent(text)}`;
}

export type LinkKey = keyof typeof LINKS;
export const link = (key: LinkKey) => (isPlaceholder(LINKS[key]) ? null : LINKS[key]);
