#!/bin/sh
# Wrapper for the Freebuff preview process: the preview's sandbox loses its
# working directory and PATH lookup (so `pnpm dev` fails with
# `pnpm dev: not found`). Calling the local `next` binary directly with
# absolute paths avoids both problems at once and works without pnpm.

set -e

exec /usr/bin/node /home/daytona/codebase/node_modules/next/dist/bin/next dev --webpack --hostname 0.0.0.0 --port "${PORT:-3256}"
