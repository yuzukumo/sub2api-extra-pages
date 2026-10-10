#!/bin/sh
set -eu
umask 077
if [ ! -s /app/data/encryption.key ]; then
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > /app/data/encryption.key
fi
export BIFROST_ENCRYPTION_KEY="$(cat /app/data/encryption.key)"
export BIFROST_PASSWORD="${BIFROST_PASSWORD:-cursor-gateway-internal}"
exec /app/docker-entrypoint.sh /app/main
