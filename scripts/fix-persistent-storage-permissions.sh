#!/bin/sh
set -eu

storage_user="${MES_LITE_STORAGE_USER:-node}"
storage_group="${MES_LITE_STORAGE_GROUP:-node}"
data_dir="${MES_LITE_DATA_DIR:-/app/data}"
upload_dir="${MES_LITE_UPLOAD_DIR:-/app/public/uploads}"
backup_dir="${MES_LITE_BACKUP_DIR:-/app/backups}"

validate_storage_dir() {
  storage_dir="$1"
  storage_label="$2"
  case "$storage_dir" in
    ""|"/"|"/app"|"/app/public")
      echo "拒绝修复过宽的${storage_label}路径：${storage_dir:-空}" >&2
      exit 1
      ;;
  esac
}

repair_storage_dir() {
  storage_dir="$1"
  storage_label="$2"
  validate_storage_dir "$storage_dir" "$storage_label"
  mkdir -p "$storage_dir"

  if [ "$(id -u)" = "0" ]; then
    if ! id "$storage_user" >/dev/null 2>&1; then
      echo "持久存储运行用户不存在：$storage_user" >&2
      exit 1
    fi
    chown -R "$storage_user:$storage_group" "$storage_dir"
  fi

  chmod -R u+rwX,g+rX,o-rwx "$storage_dir"

  if [ "$(id -u)" = "0" ]; then
    if command -v setpriv >/dev/null 2>&1; then
      setpriv \
        --reuid="$storage_user" \
        --regid="$storage_group" \
        --init-groups \
        -- test -w "$storage_dir"
    else
      echo "缺少 setpriv，无法验证降权后的写入权限" >&2
      exit 1
    fi
  elif [ ! -w "$storage_dir" ]; then
    echo "${storage_label}不可写：$storage_dir" >&2
    exit 1
  fi

  echo "持久存储权限已就绪：$storage_label -> $storage_dir"
}

repair_storage_dir "$data_dir" "数据库目录"
repair_storage_dir "$upload_dir" "附件目录"
repair_storage_dir "$backup_dir" "备份目录"
