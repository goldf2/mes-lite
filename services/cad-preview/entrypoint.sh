#!/bin/sh
set -eu

managed_font_directories=${CAD_PREVIEW_MANAGED_FONT_DIRS:-/opt/cad-fonts}

while IFS= read -r configured_font_directory; do
  [ -n "$configured_font_directory" ] || continue
  case "$configured_font_directory" in
    /opt/cad-fonts|/opt/cad-fonts/*) ;;
    *)
      echo "拒绝修复白名单外的 CAD 字体目录：$configured_font_directory" >&2
      exit 1
      ;;
  esac

  mkdir -p -- "$configured_font_directory"
  resolved_font_directory=$(readlink -f -- "$configured_font_directory")
  case "$resolved_font_directory" in
    /opt/cad-fonts|/opt/cad-fonts/*) ;;
    *)
      echo "CAD 字体目录解析后超出白名单：$configured_font_directory -> $resolved_font_directory" >&2
      exit 1
      ;;
  esac

  if find "$resolved_font_directory" -xdev -type l -print -quit | grep -q .; then
    echo "CAD 字体目录包含符号链接，拒绝自动修改权限：$resolved_font_directory" >&2
    exit 1
  fi

  chown -R root:cadpreview -- "$resolved_font_directory"
  find "$resolved_font_directory" -xdev -type d -exec chmod 0750 {} +
  find "$resolved_font_directory" -xdev -type f -exec chmod 0640 {} +
  echo "CAD 字体目录权限已就绪：path=$resolved_font_directory owner=root:cadpreview dirs=0750 files=0640"
done <<EOF
$(printf '%s' "$managed_font_directories" | tr ':' '\n')
EOF

exec setpriv \
  --reuid=cadpreview \
  --regid=cadpreview \
  --init-groups \
  --bounding-set=-all \
  --inh-caps=-all \
  --ambient-caps=-all \
  --no-new-privs \
  -- "$@"
