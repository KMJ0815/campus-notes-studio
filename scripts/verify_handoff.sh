#!/bin/sh
set -eu

ZIP_PATH="handoff/campus-notes-studio-source.zip"

if [ ! -f "$ZIP_PATH" ]; then
  echo "handoff ZIP が見つかりません: $ZIP_PATH" >&2
  exit 1
fi

if unzip -Z1 "$ZIP_PATH" | grep -E '(^|/)(\.git|node_modules|dist|__MACOSX)(/|$)' >/dev/null 2>&1; then
  echo "handoff ZIP に禁止パスが含まれています。" >&2
  exit 1
fi

ZIP_ENTRIES=$(unzip -Z1 "$ZIP_PATH")

require_file() {
  if ! printf '%s\n' "$ZIP_ENTRIES" | grep -Fx "$1" >/dev/null 2>&1; then
    echo "handoff ZIP に必須ファイルがありません: $1" >&2
    exit 1
  fi
}

require_prefix() {
  if ! printf '%s\n' "$ZIP_ENTRIES" | grep -E "^$1/" >/dev/null 2>&1; then
    echo "handoff ZIP に必須ディレクトリがありません: $1" >&2
    exit 1
  fi
}

require_file "README.md"
require_file "package.json"
require_file "package-lock.json"
require_file "index.html"
require_file "public/sw.js"
require_file "public/manifest.webmanifest"
require_file "src/App.jsx"
require_file "src/features/todos/TodosPage.jsx"
require_file "src/features/todos/TodosPage.test.jsx"
require_file "src/services/importService.js"
require_file "scripts/create_handoff.sh"
require_file "scripts/verify_handoff.sh"
require_prefix "src"
require_prefix "public"
require_prefix "scripts"

EXPECTED_LIST=$(mktemp)
ACTUAL_LIST=$(mktemp)
EXTRACT_DIR=$(mktemp -d)
cleanup() {
  rm -f "$EXPECTED_LIST" "$ACTUAL_LIST"
  rm -rf "$EXTRACT_DIR"
}
trap cleanup EXIT INT TERM

{
  printf '%s\n' \
    ".gitignore" \
    "README.md" \
    "index.html" \
    "package-lock.json" \
    "package.json" \
    "postcss.config.js" \
    "scripts/create_handoff.sh" \
    "scripts/verify_handoff.sh" \
    "tailwind.config.js" \
    "vite.config.js" \
    "vitest.config.js"
  find public src -type f | sort
} | sort > "$EXPECTED_LIST"

printf '%s\n' "$ZIP_ENTRIES" | grep -Ev '/$' | sort > "$ACTUAL_LIST"

if ! cmp -s "$EXPECTED_LIST" "$ACTUAL_LIST"; then
  echo "handoff ZIP の内容が current tree と一致していません。" >&2
  diff -u "$EXPECTED_LIST" "$ACTUAL_LIST" || true
  exit 1
fi

unzip -qq "$ZIP_PATH" -d "$EXTRACT_DIR"

while IFS= read -r path; do
  if [ ! -f "$EXTRACT_DIR/$path" ]; then
    echo "handoff ZIP にファイルが見つかりません: $path" >&2
    exit 1
  fi
  if ! cmp -s "$path" "$EXTRACT_DIR/$path"; then
    echo "handoff ZIP のファイル内容が current tree と一致していません: $path" >&2
    exit 1
  fi
done < "$EXPECTED_LIST"

echo "handoff ZIP は source-only で、必須ファイルが揃っており current tree と内容まで一致しています。"
