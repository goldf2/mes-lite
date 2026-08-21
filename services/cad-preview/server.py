from __future__ import annotations

import grp
import hmac
import json
import os
import pwd
import shutil
import shlex
import stat
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


SERVICE_NAME = "mes-lite-cad-preview"
MAX_UPLOAD_BYTES = min(max(int(os.getenv("CAD_PREVIEW_MAX_UPLOAD_BYTES", 50 * 1024 * 1024)), 1024), 100 * 1024 * 1024)
COMMAND_TIMEOUT_SECONDS = min(max(int(os.getenv("CAD_PREVIEW_COMMAND_TIMEOUT_SECONDS", "90")), 5), 600)
MAX_LAYOUTS = min(max(int(os.getenv("CAD_PREVIEW_MAX_LAYOUTS", "20")), 1), 100)
MAX_CONCURRENT_CONVERSIONS = min(max(int(os.getenv("CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS", "2")), 1), 8)
CONVERSION_QUEUE_TIMEOUT_SECONDS = min(max(int(os.getenv("CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS", "120")), 5), 600)
CJK_FALLBACK_FONT = "NotoSansCJKsc-Regular.otf"
DEFAULT_FONT_DIRECTORIES = "/usr/local/share/fonts/mes-lite:/opt/cad-fonts"
CONVERSION_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_CONVERSIONS)
SUPPORTED_ENGINES = ("libredwg", "acadsharp", "qcad")
DEFAULT_AUTO_ENGINE_ORDER = "qcad,acadsharp,libredwg"


class ConversionError(RuntimeError):
    pass


def _account_name(identifier: int, *, group: bool = False) -> str:
    try:
        return grp.getgrgid(identifier).gr_name if group else pwd.getpwuid(identifier).pw_name
    except KeyError:
        return str(identifier)


def inspect_cad_font_directory(configured_path: str | Path) -> dict[str, object]:
    configured = str(configured_path)
    path = Path(configured).expanduser().resolve(strict=False)
    result: dict[str, object] = {
        "configuredPath": configured,
        "resolvedPath": str(path),
        "processUid": os.geteuid(),
        "processGid": os.getegid(),
    }
    try:
        metadata = path.stat()
    except FileNotFoundError:
        return {**result, "status": "missing", "message": "目标路径不存在"}
    except OSError as error:
        return {**result, "status": "unavailable", "message": str(error)}

    is_directory = stat.S_ISDIR(metadata.st_mode)
    readable = os.access(path, os.R_OK)
    searchable = os.access(path, os.X_OK)
    writable = os.access(path, os.W_OK)
    if not is_directory:
        status = "not_directory"
        message = "目标路径不是目录"
    elif not readable or not searchable:
        status = "permission_denied"
        message = "转换进程缺少读取或进入目录的权限"
    else:
        status = "ready"
        message = "目录权限可用"
    return {
        **result,
        "status": status,
        "message": message,
        "ownerUid": metadata.st_uid,
        "owner": _account_name(metadata.st_uid),
        "groupGid": metadata.st_gid,
        "group": _account_name(metadata.st_gid, group=True),
        "mode": f"{stat.S_IMODE(metadata.st_mode):04o}",
        "permissions": stat.filemode(metadata.st_mode),
        "ownedByProcess": metadata.st_uid == os.geteuid(),
        "readable": readable,
        "searchable": searchable,
        "writable": writable,
        "readOnly": not writable,
    }


def configure_cad_font_directories() -> tuple[tuple[str, ...], tuple[dict[str, object], ...]]:
    configured = os.getenv("CAD_PREVIEW_FONT_DIRS", DEFAULT_FONT_DIRECTORIES)
    configured_directories = tuple(dict.fromkeys(
        item.strip()
        for item in configured.split(os.pathsep)
        if item.strip()
    ))
    statuses = tuple(inspect_cad_font_directory(item) for item in configured_directories)
    invalid = tuple(item for item in statuses if item["status"] != "ready")
    if invalid:
        details = "; ".join(
            f"{item['configuredPath']} [{item['status']}]: {item['message']}"
            for item in invalid
        )
        raise RuntimeError(f"CAD 字体目录检查失败：{details}")
    directories = tuple(str(item["resolvedPath"]) for item in statuses)
    ezdxf.options.support_dirs = list(dict.fromkeys([*ezdxf.options.support_dirs, *directories]))
    fonts.build_system_font_cache()
    return directories, statuses


CAD_FONT_DIRECTORIES, CAD_FONT_DIRECTORY_STATUS = configure_cad_font_directories()


def current_cad_font_directory_status() -> tuple[dict[str, object], ...]:
    return tuple(
        inspect_cad_font_directory(str(item["configuredPath"]))
        for item in CAD_FONT_DIRECTORY_STATUS
    )


def _command_error(result: subprocess.CompletedProcess[str]) -> str:
    detail = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
    return detail[-4000:] if detail else f"exit={result.returncode}"


def _configured_command(environment_key: str, default: str = "") -> list[str]:
    configured = os.getenv(environment_key, default).strip()
    return shlex.split(configured) if configured else []


def _command_available(command: list[str]) -> bool:
    if not command:
        return False
    executable = command[0]
    if os.path.sep in executable:
        path = Path(executable)
        return path.is_file() and os.access(path, os.X_OK)
    return shutil.which(executable) is not None


def configured_auto_engine_order() -> tuple[str, ...]:
    configured = os.getenv("CAD_PREVIEW_AUTO_ENGINE_ORDER", DEFAULT_AUTO_ENGINE_ORDER)
    values = configured.replace(":", ",").split(",")
    order = tuple(dict.fromkeys(item.strip().lower() for item in values if item.strip().lower() in SUPPORTED_ENGINES))
    return order or SUPPORTED_ENGINES


def cad_engine_statuses() -> tuple[dict[str, object], ...]:
    commands = {
        "libredwg": _configured_command("CAD_PREVIEW_LIBREDWG_COMMAND", "dwg2dxf"),
        "acadsharp": _configured_command("CAD_PREVIEW_ACADSHARP_COMMAND", "acadsharp-dwg2dxf"),
        "qcad": _configured_command("CAD_PREVIEW_QCAD_COMMAND"),
    }
    labels = {"libredwg": "LibreDWG", "acadsharp": "ACadSharp", "qcad": "QCAD"}
    statuses: list[dict[str, object]] = []
    for engine in SUPPORTED_ENGINES:
        command = commands[engine]
        available = _command_available(command)
        if engine == "qcad" and not command:
            detail = "未配置 CAD_PREVIEW_QCAD_COMMAND；QCAD 需单独安装并持有合法授权"
        elif available:
            detail = f"{labels[engine]} 命令可用：{command[0]}"
        else:
            detail = f"{labels[engine]} 命令不可用：{command[0] if command else '未配置'}"
        statuses.append({"engine": engine, "available": available, "detail": detail})
    return tuple(statuses)


def _run_converter(command: list[str], source: Path, target: Path, label: str) -> None:
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
        raise ConversionError(f"{label} 转换超时：{error.timeout}s") from error
    if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
        raise ConversionError(f"{label} 无法读取该 DWG：{_command_error(result)}")


def convert_libredwg_to_dxf(source: Path, target: Path, *, minimal: bool) -> None:
    base_command = _configured_command("CAD_PREVIEW_LIBREDWG_COMMAND", "dwg2dxf")
    if not _command_available(base_command):
        raise ConversionError("LibreDWG 命令不可用")
    command = [*base_command]
    if minimal:
        command.append("-m")
    command.extend(["-y", "-o", str(target), str(source)])
    _run_converter(command, source, target, "LibreDWG")


def convert_acadsharp_to_dxf(source: Path, target: Path) -> None:
    base_command = _configured_command("CAD_PREVIEW_ACADSHARP_COMMAND", "acadsharp-dwg2dxf")
    if not _command_available(base_command):
        raise ConversionError("ACadSharp 命令不可用")
    _run_converter([*base_command, str(source), str(target)], source, target, "ACadSharp")


def convert_qcad_to_dxf(source: Path, target: Path) -> None:
    base_command = _configured_command("CAD_PREVIEW_QCAD_COMMAND")
    if not base_command:
        raise ConversionError("QCAD 未配置；请安装 QCAD Professional 并设置 CAD_PREVIEW_QCAD_COMMAND")
    if not _command_available(base_command):
        raise ConversionError(f"QCAD 命令不可用：{base_command[0]}")
    _run_converter([*base_command, "-f", "-r", "R15", "-o", str(target), str(source)], source, target, "QCAD")


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


def validate_rendered_pdf(target: Path) -> None:
    try:
        document = fitz.open(target)
    except Exception as error:
        raise ConversionError(f"转换结果不是有效 PDF：{error}") from error
    try:
        if document.page_count == 0:
            raise ConversionError("转换结果没有页面")
        drawing_marks = 0
        text_characters = 0
        for page in document:
            drawing_marks += len(page.get_drawings())
            text_characters += len("".join(page.get_text("text").split()))
        if drawing_marks < 3 and text_characters < 2:
            raise ConversionError(
                f"转换结果内容明显不足（图元组 {drawing_marks}，文本 {text_characters} 字），将尝试其他引擎"
            )
    finally:
        document.close()


def _convert_with_engine(source: Path, target: Path, engine: str) -> None:
    converted = source.with_suffix(f".{engine}.converted.dxf")
    if engine == "libredwg":
        failures: list[str] = []
        for minimal in (False, True):
            try:
                convert_libredwg_to_dxf(source, converted, minimal=minimal)
                render_dxf_to_pdf(converted, target)
                validate_rendered_pdf(target)
                return
            except ConversionError as error:
                failures.append(f"{'最小' if minimal else '完整'}模式：{error}")
        raise ConversionError(f"LibreDWG 无法生成可用预览：{'；'.join(failures)}")
    if engine == "acadsharp":
        convert_acadsharp_to_dxf(source, converted)
    elif engine == "qcad":
        convert_qcad_to_dxf(source, converted)
    else:
        raise ConversionError(f"不支持的 CAD 转换引擎：{engine}")
    render_dxf_to_pdf(converted, target)
    validate_rendered_pdf(target)


def convert_source_to_pdf(source: Path, target: Path, engine: str = "auto") -> str:
    extension = source.suffix.lower()
    if extension == ".dxf":
        render_dxf_to_pdf(source, target)
        validate_rendered_pdf(target)
        return "dxf"
    if extension != ".dwg":
        raise ConversionError("仅支持 DWG 或 DXF 文件")

    selected_engine = engine.strip().lower()
    if selected_engine not in (*SUPPORTED_ENGINES, "auto"):
        raise ConversionError(f"不支持的 CAD 转换引擎：{engine}")
    candidates = configured_auto_engine_order() if selected_engine == "auto" else (selected_engine,)
    available = {str(item["engine"]): item["available"] is True for item in cad_engine_statuses()}
    failures: list[str] = []
    for candidate in candidates:
        if not available.get(candidate, False):
            failures.append(f"{candidate}：引擎不可用")
            continue
        try:
            target.unlink(missing_ok=True)
            _convert_with_engine(source, target, candidate)
            return candidate
        except ConversionError as error:
            failures.append(f"{candidate}：{error}")
    raise ConversionError(f"CAD 图纸转换失败：{'；'.join(failures) or '没有可用引擎'}")


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
        font_directory_status = current_cad_font_directory_status()
        fonts_ready = all(item["status"] == "ready" for item in font_directory_status)
        engine_statuses = cad_engine_statuses()
        engines_ready = any(item["available"] is True for item in engine_statuses)
        service_ready = fonts_ready and engines_ready
        payload = json.dumps(
            {
                "status": "ok" if service_ready else "unavailable",
                "engine": "multi+ezdxf",
                "autoOrder": configured_auto_engine_order(),
                "engines": engine_statuses,
                "fontDirectories": font_directory_status,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        self._send(
            HTTPStatus.OK if service_ready else HTTPStatus.SERVICE_UNAVAILABLE,
            payload,
            "application/json; charset=utf-8",
        )

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
                requested_engine = fields.get("engine", "auto").strip().lower()
                selected_engine = convert_source_to_pdf(source, target, requested_engine)
                converted = target.read_bytes()
            if not converted.startswith(b"%PDF-"):
                raise ConversionError("转换结果不是有效 PDF")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(converted)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-CAD-Preview-Engine", selected_engine)
            self.end_headers()
            self.wfile.write(converted)
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
        f"conversions={MAX_CONCURRENT_CONVERSIONS}; engines={','.join(configured_auto_engine_order())}; "
        f"fonts={','.join(CAD_FONT_DIRECTORIES) or 'none'}",
        flush=True,
    )
    for directory in CAD_FONT_DIRECTORY_STATUS:
        print(
            "CAD font directory ready: "
            f"path={directory['resolvedPath']}; owner={directory['owner']}:{directory['group']}; "
            f"uid={directory['ownerUid']}; gid={directory['groupGid']}; "
            f"mode={directory['mode']}; readable={directory['readable']}; "
            f"searchable={directory['searchable']}; writable={directory['writable']}",
            flush=True,
        )
    server.serve_forever()


if __name__ == "__main__":
    main()
