# LibreDWG CAD preview service

Private DWG/DXF-to-PDF service for MES-lite. It implements the existing internal contract:

- `GET /health`
- `POST /v1/convert/pdf` with multipart fields `file` and `output=pdf`

The service converts DWG to DXF with GNU LibreDWG and renders DXF layouts to a read-only PDF with ezdxf/PyMuPDF. Missing SHX and CAD big-font references fall back to the bundled Noto Sans CJK SC font so decoded Chinese text remains visible. Original attachments remain in MES-lite; this service only uses an isolated temporary directory and does not retain uploads.

Build from the repository root:

```bash
docker build -f services/cad-preview/Dockerfile -t mes-lite-cad-preview:0.1.418 .
```

Run on a private container network:

```bash
docker run --read-only --tmpfs /tmp:size=256m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges \
  -e CAD_PREVIEW_SERVICE_TOKEN='<same-secret-as-mes-lite>' \
  mes-lite-cad-preview:0.1.418
```

This is a 2D trial engine, pinned to LibreDWG 0.14. LibreDWG and ezdxf do not provide pixel-perfect support for every recent or vertical-product DWG entity. Keep download-original and optional companion-PDF workflows available for drawings that fail acceptance.

## Licensing

- GNU LibreDWG is GPL-3.0-or-later.
- ezdxf is MIT licensed.
- PyMuPDF is AGPL-3.0-or-later or available under a commercial license.

The converter stays in a separate service boundary so its license, source delivery and replacement lifecycle remain distinct from the MES-lite Web application. Review distribution obligations before delivering the converter image outside the operator's own infrastructure.
