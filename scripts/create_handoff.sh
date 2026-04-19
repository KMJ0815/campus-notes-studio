#!/bin/sh
set -eu

mkdir -p handoff
rm -f handoff/campus-notes-studio-source.zip

zip -qr handoff/campus-notes-studio-source.zip \
  README.md \
  package.json \
  package-lock.json \
  vite.config.js \
  vitest.config.js \
  postcss.config.js \
  tailwind.config.js \
  index.html \
  .gitignore \
  public \
  src \
  scripts/create_handoff.sh \
  scripts/verify_handoff.sh
