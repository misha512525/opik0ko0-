/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SHOW_TODO?: string;
  readonly PUBLIC_YM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ym?: (id: number, action: string, ...args: unknown[]) => void;
  __akReady?: boolean;
}
