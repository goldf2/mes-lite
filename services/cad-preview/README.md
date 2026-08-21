# LibreDWG CAD preview service

Private DWG/DXF-to-PDF service for MES-lite. It implements the existing internal contract:

- `GET /health`
- `POST /v1/convert/pdf` with multipart fields `file` and `output=pdf`

The service converts DWG to DXF with GNU LibreDWG and renders DXF layouts to a read-only PDF with ezdxf/PyMuPDF. Missing SHX and CAD big-font references fall back to the bundled Noto Sans CJK SC font so decoded Chinese text remains visible. Original attachments remain in MES-lite; this service only uses an isolated temporary directory and does not retain uploads. Both MES-lite and the converter limit active conversions to two by default so a document page cannot exhaust a small converter with many simultaneous thumbnail requests.

Build from the repository root:

```bash
docker build -f services/cad-preview/Dockerfile -t mes-lite-cad-preview:0.1.426 .
```

Run on a private container network:

```bash
docker run --read-only --tmpfs /tmp:size=256m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount type=bind,src=/srv/mes-lite/cad-fonts,dst=/opt/cad-fonts,readonly \
  -e CAD_PREVIEW_SERVICE_TOKEN='<same-secret-as-mes-lite>' \
  mes-lite-cad-preview:0.1.426
```

## External CAD fonts

The image always scans `/usr/local/share/fonts/mes-lite` and the optional mounted directory `/opt/cad-fonts` at startup. Put legally licensed `.shx`, `.shp`, `.lff`, `.ttf`, `.ttc`, or `.otf` files in the external directory and restart the converter. The service adds the directory to `ezdxf.options.support_dirs` and rebuilds the ezdxf font cache automatically. Preserve the exact filenames referenced by the drawing; an unrelated Chinese font cannot reproduce a missing CAD big font or its metrics.

Override the directory list with a colon-separated value when required:

```env
CAD_PREVIEW_FONT_DIRS=/usr/local/share/fonts/mes-lite:/opt/cad-fonts
CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS=2
CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS=120
```

Do not commit Autodesk, supplier, or customer font binaries to this repository unless their license explicitly permits redistribution. A private read-only persistent mount is the preferred production path. After adding or replacing fonts, restart `cad-preview` and use MES-lite's **重新生成预览** action for cached drawings.

This is a 2D trial engine, pinned to LibreDWG 0.14. LibreDWG and ezdxf do not provide pixel-perfect support for every recent or vertical-product DWG entity. Keep download-original and optional companion-PDF workflows available for drawings that fail acceptance.

## Licensing

- GNU LibreDWG is GPL-3.0-or-later.
- ezdxf is MIT licensed.
- PyMuPDF is AGPL-3.0-or-later or available under a commercial license.

The converter stays in a separate service boundary so its license, source delivery and replacement lifecycle remain distinct from the MES-lite Web application. Review distribution obligations before delivering the converter image outside the operator's own infrastructure.
