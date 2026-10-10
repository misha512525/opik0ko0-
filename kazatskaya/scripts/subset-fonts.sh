#!/usr/bin/env bash
# Урезает латинские файлы шрифтов до реально нужных символов: цифры, ASCII, «», —, …, ₽.
# Экономит ~90 КБ. Нужен fonttools: pip install fonttools brotli
# Запуск (после npm run media): bash scripts/subset-fonts.sh
set -euo pipefail
PYFTSUBSET="${PYFTSUBSET:-pyftsubset}"
UNICODES="U+0020-007E,U+00A0,U+00AB,U+00B7,U+00BB,U+2013,U+2014,U+2026,U+20BD"
for f in public/fonts/*-latin-*.woff2; do
  src="node_modules/$(case "$f" in
    *cormorant*) echo "@fontsource-variable/cormorant-garamond" ;;
    *manrope*) echo "@fontsource-variable/manrope" ;;
    *marck*) echo "@fontsource/marck-script" ;;
  esac)/files/$(basename "$f")"
  "$PYFTSUBSET" "$src" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 --output-file="$f"
  echo "$f: $(($(stat -c %s "$f") / 1024)) КБ"
done
