from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

import ezdxf
try:
    import pymupdf as fitz
except ImportError:
    import fitz

from server import (
    CAD_FONT_DIRECTORIES,
    CAD_FONT_DIRECTORY_STATUS,
    CJK_FALLBACK_FONT,
    apply_cad_font_fallbacks,
    cad_engine_statuses,
    configured_auto_engine_order,
    convert_source_to_pdf,
    inspect_cad_font_directory,
    validate_rendered_pdf,
    ConversionError,
)


def assert_pdf(path: Path) -> None:
    content = path.read_bytes()
    assert content.startswith(b"%PDF-"), f"invalid PDF: {path}"
    assert len(content) > 500, f"empty PDF: {path}"


def main() -> None:
    assert "/usr/local/share/fonts/mes-lite" in CAD_FONT_DIRECTORIES
    assert all(item["status"] == "ready" for item in CAD_FONT_DIRECTORY_STATUS)
    with tempfile.TemporaryDirectory(prefix="cad-preview-smoke-") as temporary_directory:
        root = Path(temporary_directory)
        directory_status = inspect_cad_font_directory(root)
        assert directory_status["status"] == "ready"
        assert directory_status["ownerUid"] == os.geteuid()
        assert directory_status["readable"] is True
        assert directory_status["searchable"] is True

        invalid_target = root / "font-file"
        invalid_target.write_text("not a directory", encoding="utf-8")
        assert inspect_cad_font_directory(invalid_target)["status"] == "not_directory"

        restricted_target = root / "restricted-fonts"
        restricted_target.mkdir()
        restricted_target.chmod(0)
        try:
            assert inspect_cad_font_directory(restricted_target)["status"] == "permission_denied"
        finally:
            restricted_target.chmod(0o700)

        source_dxf = root / "drawing.dxf"
        source_dwg = root / "drawing.dwg"
        dxf_pdf = root / "dxf.pdf"
        dwg_pdf = root / "dwg-auto.pdf"

        document = ezdxf.new("R2000")
        modelspace = document.modelspace()
        modelspace.add_lwpolyline([(0, 0), (120, 0), (120, 60), (0, 60)], close=True)
        modelspace.add_circle((60, 30), radius=18)
        modelspace.add_line((0, 0), (120, 60))
        chinese_style = document.styles.add("HZ", font="txt.shx")
        chinese_style.dxf.bigfont = "hztxt.shx"
        modelspace.add_text("中", dxfattribs={"style": "HZ", "height": 8}).set_placement((8, 8))
        document.saveas(source_dxf)

        apply_cad_font_fallbacks(document)
        assert document.styles.get("HZ").dxf.font == CJK_FALLBACK_FONT
        assert document.styles.get("HZ").dxf.bigfont == ""
        available_style = document.styles.add("CJK", font=CJK_FALLBACK_FONT)
        apply_cad_font_fallbacks(document)
        assert available_style.dxf.font == CJK_FALLBACK_FONT

        assert convert_source_to_pdf(source_dxf, dxf_pdf) == "dxf"
        assert_pdf(dxf_pdf)

        sparse_pdf = root / "sparse.pdf"
        sparse = fitz.open()
        sparse.new_page().draw_rect(fitz.Rect(20, 20, 80, 40), fill=(0, 0, 0))
        sparse.save(sparse_pdf)
        sparse.close()
        try:
            validate_rendered_pdf(sparse_pdf)
        except ConversionError:
            pass
        else:
            raise AssertionError("obviously sparse PDF must be rejected")

        result = subprocess.run(
            ["dxf2dwg", "-y", "-o", str(source_dwg), str(source_dxf)],
            capture_output=True,
            check=False,
            text=True,
        )
        if result.returncode != 0 or not source_dwg.is_file():
            raise RuntimeError(f"LibreDWG DXF fixture conversion failed: {result.stdout}\n{result.stderr}")
        statuses = {str(item["engine"]): item["available"] is True for item in cad_engine_statuses()}
        assert statuses["libredwg"] is True
        assert statuses["acadsharp"] is True
        assert statuses["qcad"] is False
        assert configured_auto_engine_order() == ("qcad", "acadsharp", "libredwg")

        for engine in ("libredwg", "acadsharp"):
            engine_pdf = root / f"dwg-{engine}.pdf"
            assert convert_source_to_pdf(source_dwg, engine_pdf, engine) == engine
            assert_pdf(engine_pdf)

        assert convert_source_to_pdf(source_dwg, dwg_pdf, "auto") in {"acadsharp", "libredwg"}
        assert_pdf(dwg_pdf)

    print("Multi-engine CAD preview smoke test passed")


if __name__ == "__main__":
    main()
