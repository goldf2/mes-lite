from __future__ import annotations

import hmac
import os
import shutil
import subprocess
import tempfile
import threading
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
from ezdxf.fonts import fonts


SERVICE_NAME = "mes-lite-libredwg-preview"
MAX_UPLOAD_BYTES = min(max(int(os.getenv("CAD_PREVIEW_MAX_UPLOAD_BYTES", 50 * 1024 * 1024)), 1024), 100 * 1024 * 1024)
COMMAND_TIMEOUT_SECONDS = min(max(int(os.getenv("CAD_PREVIEW_COMMAND_TIMEOUT_SECONDS", "90")), 5), 600)
MAX_LAYOUTS = min(max(int(os.getenv("CAD_PREVIEW_MAX_LAYOUTS", "20")), 1), 100)
MAX_CONCURRENT_CONVERSIONS = min(max(int(os.getenv("CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS", "2")), 1), 8)
CONVERSION_QUEUE_TIMEOUT_SECONDS = min(max(int(os.getenv("CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS", "120")), 5), 600)
CJK_FALLBACK_FONT = "NotoSansCJKsc-Regular.otf"
DEFAULT_FONT_DIRECTORIES = "/usr/local/share/fonts/mes-lite:/opt/cad-fonts"
CONVERSION_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_CONVERSIONS)


class ConversionError(RuntimeError):
    pass


def configure_cad_font_directories() -> tuple[str, ...]:
    configured = os.getenv("CAD_PREVIEW_FONT_DIRS", DEFAULT_FONT_DIRECTORIES)
    directories = tuple(
        str(Path(item.strip()).expanduser().resolve())
        for item in configured.split(os.pathsep)
        if item.strip() and Path(item.strip()).expanduser().is_dir()
    )
    ezdxf.options.support_dirs = list(dict.fromkeys([*ezdxf.options.support_dirs, *directories]))
    fonts.build_system_font_cache()
    return directories


CAD_FONT_DIRECTORIES = configure_cad_font_directories()


def _command_error(result: subprocess.CompletedProcess[str]) -> str:
    detail = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
    return detail[-4000:] if detail else f"exit={result.returncode}"


def convert_dwg_to_dxf(source: Path, target: Path, *, minimal: bool) -> None:
    command = ["dwg2dxf"]
    if minimal:
        command.append("-m")
    command.extend(["-y", "-o", str(target), str(source)])
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
        raise ConversionError(f"LibreDWG 转换超时：{error.timeout}s") from error
    if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
        raise ConversionError(f"LibreDWG 无法读取该 DWG：{_command_error(result)}")


def _renderable_layouts(document: ezdxf.document.Drawing):
    layouts = [document.modelspace()]
    layouts.extend(item for item in document.layouts if item.name.lower() != "model" and len(item) > 0)
    return layouts[:MAX_LAYOUTS]


def _font_is_available(font_name: str) -> bool:
    if not font_name:
        return False
    if fonts.font_manager.has_font(font_name):
        return True
    resolved = fonts.resolve_shx_font_name(font_name, order="tsl")
    return fonts.font_manager.has_font(resolved)


def apply_cad_font_fallbacks(document: ezdxf.document.Drawing) -> None:
    if not fonts.font_manager.has_font(CJK_FALLBACK_FONT):
        raise ConversionError(f"CAD 中文回退字体不可用：{CJK_FALLBACK_FONT}")

    for text_style in document.styles:
        primary_font = str(text_style.dxf.get("font", "")).strip()
        big_font = str(text_style.dxf.get("bigfont", "")).strip()
        primary_missing = bool(primary_font) and not _font_is_available(primary_font)
        big_font_missing = bool(big_font) and not _font_is_available(big_font)
        if primary_missing or big_font_missing:
            text_style.dxf.font = CJK_FALLBACK_FONT
            text_style.dxf.bigfont = ""


def render_dxf_to_pdf(source: Path, target: Path) -> None:
    try:
        document, _auditor = recover.readfile(source)
    except (OSError, ValueError, ezdxf.DXFError) as error:
        raise ConversionError(f"DXF 文件无法解析：{error}") from error

    apply_cad_font_fallbacks(document)

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
    failures: list[str] = []
    for minimal in (False, True):
        try:
            convert_dwg_to_dxf(source, converted, minimal=minimal)
            render_dxf_to_pdf(converted, target)
            return
        except ConversionError as error:
            failures.append(f"{'最小' if minimal else '完整'}模式：{error}")
    raise ConversionError(f"LibreDWG 无法生成可预览图纸：{'；'.join(failures)}")


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
        if not CONVERSION_SLOTS.acquire(timeout=CONVERSION_QUEUE_TIMEOUT_SECONDS):
            self._text(HTTPStatus.SERVICE_UNAVAILABLE, "CAD 转换队列繁忙，请稍后重试")
            return
        try:
            body = self.rfile.read(content_length)
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
        finally:
            CONVERSION_SLOTS.release()

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer((host, port), CadPreviewHandler)
    print(
        f"{SERVICE_NAME} listening on {host}:{port}; "
        f"conversions={MAX_CONCURRENT_CONVERSIONS}; fonts={','.join(CAD_FONT_DIRECTORIES) or 'none'}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
