# Multi-engine CAD preview service

Private DWG/DXF-to-PDF service for MES-lite. It implements the existing internal contract:

- `GET /health`
- `POST /v1/convert/pdf` with multipart fields `file`, `output=pdf`, and `engine=auto|libredwg|acadsharp|qcad`

The image includes two free DWG-to-DXF engines: GNU LibreDWG and the MIT-licensed ACadSharp adapter. It can also call a separately installed and licensed QCAD Professional `dwg2dwg` command. All engines share the same ezdxf/PyMuPDF read-only PDF renderer. `auto` tries the configured available engines in order and rejects a technically valid but obviously empty/sparse PDF before falling back. The response header `X-CAD-Preview-Engine` reports the engine that succeeded.

Missing SHX and CAD big-font references fall back to the bundled Noto Sans CJK SC font so decoded Chinese text remains visible. Original attachments remain in MES-lite; this service only uses an isolated temporary directory and does not retain uploads. Both MES-lite and the converter limit active conversions to two by default so a document page cannot exhaust a small converter with many simultaneous thumbnail requests.

Build from the repository root:

```bash
docker build -f services/cad-preview/Dockerfile -t mes-lite-cad-preview:0.1.430 .
```

Run on a private container network:

```bash
docker run --read-only --tmpfs /tmp:size=256m,mode=1777 \
  --cap-drop ALL \
  --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  --cap-add SETUID --cap-add SETGID --cap-add SETPCAP \
  --security-opt no-new-privileges \
  --mount type=bind,src=/srv/mes-lite/cad-fonts,dst=/opt/cad-fonts \
  -e CAD_PREVIEW_SERVICE_TOKEN='<same-secret-as-mes-lite>' \
  mes-lite-cad-preview:0.1.430
```

## Engines

The built-in defaults are:

```env
CAD_PREVIEW_LIBREDWG_COMMAND=dwg2dxf
CAD_PREVIEW_ACADSHARP_COMMAND=/usr/local/bin/acadsharp-dwg2dxf
CAD_PREVIEW_AUTO_ENGINE_ORDER=qcad,acadsharp,libredwg
```

`GET /health` reports `autoOrder` and one availability record for each engine. MES-lite exposes these values at **系统设置 → 文件预览**. Selecting an explicit engine creates and reuses that engine's own derived PDF/thumbnail cache; `auto` uses a separate cache.

QCAD is not included in this repository or image. To enable it, install QCAD Professional in a private derivative image or controlled mount according to its license, ensure its `dwg2dwg` command can run as UID 10001 without a desktop session, and set for example:

```env
CAD_PREVIEW_QCAD_COMMAND=/opt/qcad/dwg2dwg
```

The service appends `-f -r R15 -o <target.dxf> <source.dwg>`. A wrapper script may be configured instead when the licensed installation requires environment setup. Do not point this variable at an interactive GUI executable.

## External CAD fonts

The image always scans `/usr/local/share/fonts/mes-lite` and the optional mounted directory `/opt/cad-fonts` at startup. Put legally licensed `.shx`, `.shp`, `.lff`, `.ttf`, `.ttc`, or `.otf` files in the external directory and restart the converter. The service adds the directory to `ezdxf.options.support_dirs` and rebuilds the ezdxf font cache automatically. Preserve the exact filenames referenced by the drawing; an unrelated Chinese font cannot reproduce a missing CAD big font or its metrics.

Override the directory list with a colon-separated value when required:

```env
CAD_PREVIEW_FONT_DIRS=/usr/local/share/fonts/mes-lite:/opt/cad-fonts
CAD_PREVIEW_MANAGED_FONT_DIRS=/opt/cad-fonts
CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS=2
CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS=120
```

The standard entrypoint starts as root only long enough to repair the allow-listed `/opt/cad-fonts` mount. It rejects paths outside that tree and symbolic links, sets directories to `root:cadpreview 0750` and files to `root:cadpreview 0640`, then immediately starts the converter through `setpriv` as the unprivileged `cadpreview` user (UID 10001) with no-new-privileges and empty capability bounding, inheritable and ambient sets. The mount must therefore allow the short initialization repair and the container needs only `CHOWN`, `FOWNER`, `DAC_OVERRIDE`, `SETUID`, `SETGID` and `SETPCAP` during that phase; after privilege drop, the converter can read but cannot modify the font files or regain those capabilities. Startup logs and the protected `GET /health` response report the resolved path, owner UID/GID, mode and effective read/search/write access. Health rechecks the live paths on every request and returns 503 if a mounted directory later becomes unavailable. A configured path that is missing, not a directory or unreadable stops startup with an explicit error.

Do not commit Autodesk, supplier, or customer font binaries to this repository unless their license explicitly permits redistribution. A private persistent mount managed by the guarded startup entrypoint is the preferred production path. After adding or replacing fonts, restart `cad-preview` and use MES-lite's **重新生成预览** action for cached drawings.

This is a 2D preview pipeline, pinned to LibreDWG 0.14 and ACadSharp 3.7.1. None of the engines or the shared renderer guarantees pixel-perfect support for every recent or vertical-product DWG entity. Keep download-original and optional companion-PDF workflows available for drawings that fail visual acceptance.

## Licensing

- GNU LibreDWG is GPL-3.0-or-later.
- ACadSharp is MIT licensed.
- ezdxf is MIT licensed.
- PyMuPDF is AGPL-3.0-or-later or available under a commercial license.
- QCAD Professional is optional commercial software and must be installed, licensed, and operated separately by the deployer. QCAD Community Edition does not provide DWG support.

The converter stays in a separate service boundary so its license, source delivery and replacement lifecycle remain distinct from the MES-lite Web application. Review distribution obligations before delivering the converter image outside the operator's own infrastructure.
