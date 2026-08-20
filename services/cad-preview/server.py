from __future__ import annotations

import hmac
import os
import shutil
import subprocess
import tempfile
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import ezdxf
try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24 compatibility
    import fitz  # type: ignore[no-redef]
from ezdxf import recover
from ezdxf.addons.drawing import Frontend, RenderContext, config, layout as drawing_layout
from ezdxf.addons.drawing import pymupdf as drawing_pymupdf


SERVICE_NAME = "mes-lite-libredwg-preview"
MAX_UPLOAD_BYTES = min(max(int(os.getenv("CAD_PREVIEW_MAX_UPLOAD_BYTES", 50 * 1024 * 1024)), 1024), 100 * 1024 * 1024)
COMMAND_TIMEOUT_SECONDS = min(max(int(os.getenv("CAD_PREVIEW_COMMAND_TIMEOUT_SECONDS", "90")), 5), 600)
MAX_LAYOUTS = min(max(int(os.getenv("CAD_PREVIEW_MAX_LAYOUTS", "20")), 1), 100)


class ConversionError(RuntimeError):
    pass


def _command_error(result: subprocess.CompletedProcess[str]) -> str:
    detail = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
    return detail[-4000:] if detail else f"exit={result.returncode}"


def convert_dwg_to_dxf(source: Path, target: Path) -> None:
    attempts = (
        ["dwg2dxf", "-y", "-o", str(target), str(source)],
        ["dwg2dxf", "-m", "-y", "-o", str(target), str(source)],
    )
    failures: list[str] = []
    for command in attempts:
        target.unlink(missing_ok=True)
        try:
            result = subprocess.run(
                command,
                cwd=source.parent,
                capture_output=True,
                check=False,
                text=True,
                timeout=COMMAND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as error:
            failures.append(f"转换超时：{error.timeout}s")
            continue
        if result.returncode == 0 and target.is_file() and target.stat().st_size > 0:
            return
        failures.append(_command_error(result))
    raise ConversionError(f"LibreDWG 无法读取该 DWG：{'；'.join(failures)}")


def _renderable_layouts(document: ezdxf.document.Drawing):
    layouts = [document.modelspace()]
    layouts.extend(item for item in document.layouts if item.name.lower() != "model" and len(item) > 0)
    return layouts[:MAX_LAYOUTS]


def render_dxf_to_pdf(source: Path, target: Path) -> None:
    try:
        document, _auditor = recover.readfile(source)
    except (OSError, ezdxf.DXFError) as error:
        raise ConversionError(f"DXF 文件无法解析：{error}") from error

    output = fitz.open()
    render_errors: list[str] = []
    try:
        for dxf_layout in _renderable_layouts(document):
            try:
                backend = drawing_pymupdf.PyMuPdfBackend()
                frontend = Frontend(
                    RenderContext(document),
                    backend,
                    config=config.Configuration(background_policy=config.BackgroundPolicy.WHITE),
                )
                frontend.draw_layout(dxf_layout)
                page = drawing_layout.Page(0, 0, margins=drawing_layout.Margins.all(5))
                page_bytes = backend.get_pdf_bytes(page)
                rendered = fitz.open(stream=page_bytes, filetype="pdf")
                try:
                    output.insert_pdf(rendered)
                finally:
                    rendered.close()
            except Exception as error:  # keep other valid layouts available
                render_errors.append(f"{dxf_layout.name}: {error}")
        if output.page_count == 0:
            detail = "；".join(render_errors) or "图纸没有可渲染内容"
            raise ConversionError(f"DXF 渲染失败：{detail}")
        output.save(target, garbage=4, deflate=True)
    finally:
        output.close()


def convert_source_to_pdf(source: Path, target: Path) -> None:
    extension = source.suffix.lower()
    if extension == ".dxf":
        render_dxf_to_pdf(source, target)
        return
    if extension != ".dwg":
        raise ConversionError("仅支持 DWG 或 DXF 文件")
    converted = source.with_suffix(".converted.dxf")
    convert_dwg_to_dxf(source, converted)
    render_dxf_to_pdf(converted, target)


def _authorized(headers) -> bool:
    configured = os.getenv("CAD_PREVIEW_SERVICE_TOKEN", "").strip()
    if not configured:
        return True
    supplied = headers.get("Authorization", "")
    return hmac.compare_digest(supplied, f"Bearer {configured}")


def _multipart_fields(content_type: str, body: bytes):
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
    )
    if not message.is_multipart():
        raise ConversionError("请求必须使用 multipart/form-data")
    fields: dict[str, str] = {}
    uploaded: tuple[str, bytes] | None = None
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        filename = part.get_filename()
        if name == "file" and filename:
            uploaded = (Path(filename).name, payload)
        elif len(payload) <= 1024:
            fields[name] = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    if uploaded is None:
        raise ConversionError("缺少 file 上传字段")
    return fields, uploaded


class CadPreviewHandler(BaseHTTPRequestHandler):
    server_version = SERVICE_NAME

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _text(self, status: int, message: str) -> None:
        self._send(status, message.encode("utf-8"), "text/plain; charset=utf-8")

    def _require_authorization(self) -> bool:
        if _authorized(self.headers):
            return True
        self._text(HTTPStatus.UNAUTHORIZED, "unauthorized")
        return False

    def do_GET(self) -> None:
        if self.path != "/health":
            self._text(HTTPStatus.NOT_FOUND, "not found")
            return
        if not self._require_authorization():
            return
        if shutil.which("dwg2dxf") is None:
            self._text(HTTPStatus.SERVICE_UNAVAILABLE, "LibreDWG dwg2dxf unavailable")
            return
        self._send(HTTPStatus.OK, b'{"status":"ok","engine":"LibreDWG+ezdxf"}', "application/json")

    def do_POST(self) -> None:
        if self.path != "/v1/convert/pdf":
            self._text(HTTPStatus.NOT_FOUND, "not found")
            return
        if not self._require_authorization():
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self._text(HTTPStatus.LENGTH_REQUIRED, "missing content length")
            return
        if content_length > MAX_UPLOAD_BYTES:
            self._text(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "CAD file too large")
            return
        body = self.rfile.read(content_length)
        try:
            fields, (filename, file_bytes) = _multipart_fields(self.headers.get("Content-Type", ""), body)
            if fields.get("output", "pdf").strip().lower() != "pdf":
                raise ConversionError("仅支持 PDF 输出")
            extension = Path(filename).suffix.lower()
            if extension not in {".dwg", ".dxf"}:
                raise ConversionError("仅支持 DWG 或 DXF 文件")
            with tempfile.TemporaryDirectory(prefix="cad-preview-") as temporary_directory:
                source = Path(temporary_directory) / f"source{extension}"
                target = Path(temporary_directory) / "preview.pdf"
                source.write_bytes(file_bytes)
                convert_source_to_pdf(source, target)
                converted = target.read_bytes()
            if not converted.startswith(b"%PDF-"):
                raise ConversionError("转换结果不是有效 PDF")
            self._send(HTTPStatus.OK, converted, "application/pdf")
        except ConversionError as error:
            self._text(HTTPStatus.UNPROCESSABLE_ENTITY, str(error))
        except Exception as error:
            self.log_error("conversion failed: %s", error)
            self._text(HTTPStatus.INTERNAL_SERVER_ERROR, "CAD 转换服务内部错误")

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer((host, port), CadPreviewHandler)
    print(f"{SERVICE_NAME} listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
