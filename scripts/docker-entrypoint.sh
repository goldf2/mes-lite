#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$script_dir/fix-persistent-storage-permissions.sh"

if [ "$(id -u)" = "0" ]; then
  exec gosu "${MES_LITE_STORAGE_USER:-node}:${MES_LITE_STORAGE_GROUP:-node}" "$@"
fi

exec "$@"
