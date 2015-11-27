#!/bin/bash
#
# Build the verifier image before running the container command
# 
set -e

if [[ -z "$SKIP_BUILD" || "$SKIP_BUILD" -eq 0 ]]; then
	/app/bin/verifier build-verifiers
fi

exec "$@"