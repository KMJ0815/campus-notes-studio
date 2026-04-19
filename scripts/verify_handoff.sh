#!/bin/sh
set -eu

ZIP_PATH="handoff/campus-notes-studio-source.zip"

if [ ! -f "$ZIP_PATH" ]; then
  echo "handoff ZIP が見つかりません: $ZIP_PATH" >&2
  exit 1
fi

if unzip -Z1 "$ZIP_PATH" | grep -E '(^|/)(node_modules|dist|__MACOSX)(/|$)' >/dev/null 2>&1; then
  echo "handoff ZIP に禁止パスが含まれています。" >&2
  exit 1
fi

echo "handoff ZIP の内容は source-only です。"
