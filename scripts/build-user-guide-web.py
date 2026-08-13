#!/usr/bin/env python3
"""Build a portable, searchable offline HTML package from the MES-lite SOP Markdown."""

from __future__ import annotations

import html
import re
import shutil
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.362"
SOURCE = ROOT / "docs/operations/user-guide" / f"MES-lite全流程作业指导书-v{VERSION}.md"
OUTPUT = ROOT / "output/web" / f"MES-lite全流程作业指导书-v{VERSION}"


@dataclass
class Workflow:
    chapter: str
    title: str
    objective: str
    steps: list[str]
    result: str
    image_source: Path
    image_relative: Path


def parse_workflows() -> tuple[list[str], str, list[Workflow], list[str]]:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    metadata: list[str] = []
    important = ""
    workflows: list[Workflow] = []
    boundaries: list[str] = []
    chapter = ""
    title = ""
    objective = ""
    steps: list[str] = []
    result = ""
    image = ""
    section = "intro"

    def flush() -> None:
        nonlocal title, objective, steps, result, image
        if not title:
            return
        if not image:
            raise ValueError(f"流程缺少截图：{title}")
        source = (SOURCE.parent / image).resolve()
        if not source.exists():
            raise FileNotFoundError(source)
        relative = Path("assets") / Path(image).relative_to("screenshots")
        workflows.append(Workflow(chapter, title, objective, steps, result, source, relative))
        title = objective = result = image = ""
        steps = []

    for raw in lines:
        line = raw.strip()
        if line.startswith("## "):
            flush()
            chapter = line[3:]
            section = "boundaries" if chapter == "暂不作为现行 SOP 的治理项" else "chapter"
        elif line.startswith("### "):
            flush()
            title = line[4:]
            section = "workflow"
        elif title and line.startswith("目的："):
            objective = line.removeprefix("目的：")
        elif title and re.match(r"^\d+\.\s+", line):
            steps.append(re.sub(r"^\d+\.\s+", "", line))
        elif title and line.startswith("结果检查："):
            result = line.removeprefix("结果检查：")
        elif title and (match := re.fullmatch(r"!\[[^]]*\]\(([^)]+)\)", line)):
            image = match.group(1)
        elif section == "intro" and line.startswith("- "):
            metadata.append(line[2:])
        elif section == "intro" and line.startswith("> "):
            important = line[2:]
        elif section == "boundaries" and line.startswith("- "):
            boundaries.append(line[2:])
    flush()
    return metadata, important, workflows, boundaries


def build() -> Path:
    metadata, important, workflows, boundaries = parse_workflows()
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    copied: set[Path] = set()
    for workflow in workflows:
        if workflow.image_relative in copied:
            continue
        target = OUTPUT / workflow.image_relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(workflow.image_source, target)
        copied.add(workflow.image_relative)

    chapters: list[str] = []
    for workflow in workflows:
        if workflow.chapter not in chapters:
            chapters.append(workflow.chapter)

    nav = "".join(
        f'<a href="#chapter-{index}">{html.escape(chapter)}</a>'
        for index, chapter in enumerate(chapters, start=1)
    )
    metadata_html = "".join(f"<li>{html.escape(item)}</li>" for item in metadata)
    boundaries_html = "".join(f"<li>{html.escape(item)}</li>" for item in boundaries)
    cards: list[str] = []
    current_chapter = ""
    chapter_index = 0
    for index, workflow in enumerate(workflows, start=1):
        if workflow.chapter != current_chapter:
            current_chapter = workflow.chapter
            chapter_index += 1
            cards.append(
                f'<h2 class="chapter" id="chapter-{chapter_index}">{html.escape(workflow.chapter)}</h2>'
            )
        searchable = " ".join([workflow.chapter, workflow.title, workflow.objective, *workflow.steps, workflow.result])
        step_html = "".join(f"<li>{html.escape(step)}</li>" for step in workflow.steps)
        cards.append(f"""
<article class="workflow" data-search="{html.escape(searchable.lower(), quote=True)}">
  <div class="workflow-head"><span class="number">流程 {index:03d}</span><h3>{html.escape(workflow.title)}</h3></div>
  <p class="objective"><strong>目的</strong>{html.escape(workflow.objective)}</p>
  <ol>{step_html}</ol>
  <p class="result"><strong>结果检查</strong>{html.escape(workflow.result)}</p>
  <button class="shot" type="button" aria-label="放大查看 {html.escape(workflow.title, quote=True)}">
    <img loading="lazy" src="{workflow.image_relative.as_posix()}" alt="{html.escape(workflow.title, quote=True)}">
  </button>
</article>""")

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MES-lite 全流程作业指导书 v{VERSION}</title>
<style>
:root{{--ink:#172033;--muted:#667085;--line:#d9e1ec;--blue:#2563eb;--blue-soft:#eff6ff;--green:#047857;--green-soft:#ecfdf3;--paper:#fff;--bg:#f4f7fb}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}}
.layout{{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:100vh}}aside{{position:sticky;top:0;height:100vh;overflow:auto;padding:24px;background:#12213a;color:#fff}}aside h1{{font-size:20px;margin:0 0 4px}}aside p{{margin:0 0 18px;color:#a9bad4;font-size:13px}}aside a{{display:block;padding:7px 9px;border-radius:8px;color:#d8e5f8;text-decoration:none;font-size:13px}}aside a:hover{{background:#203754;color:#fff}}
main{{width:min(1180px,100%);padding:36px 42px 80px}}.hero,.workflow,.boundaries{{background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 24px rgba(23,32,51,.06)}}.hero{{padding:34px;margin-bottom:24px}}.hero h2{{font-size:36px;margin:0 0 8px}}.meta{{padding-left:20px;color:var(--muted)}}.notice{{padding:18px 20px;background:var(--blue-soft);border-left:4px solid var(--blue);border-radius:10px}}
.toolbar{{position:sticky;top:12px;z-index:5;display:flex;gap:12px;margin:20px 0;padding:12px;background:rgba(244,247,251,.93);backdrop-filter:blur(10px)}}#search{{width:100%;padding:13px 16px;border:1px solid #bcc8d8;border-radius:12px;font-size:16px;background:#fff}}#count{{white-space:nowrap;align-self:center;color:var(--muted)}}
.chapter{{margin:42px 0 16px;font-size:26px;scroll-margin-top:90px}}.workflow{{padding:28px;margin:0 0 22px;scroll-margin-top:90px}}.workflow-head{{display:flex;gap:16px;align-items:flex-start}}.workflow h3{{font-size:25px;line-height:1.3;margin:0 0 18px}}.number{{flex:none;padding:4px 10px;border-radius:999px;background:var(--blue-soft);color:var(--blue);font-size:13px;font-weight:700}}.objective,.result{{display:grid;grid-template-columns:86px 1fr;gap:12px;padding:14px 16px;border-radius:10px}}.objective{{background:var(--blue-soft)}}.result{{background:var(--green-soft);color:#065f46}}.workflow ol{{padding-left:28px}}.shot{{display:block;width:100%;margin-top:18px;padding:0;border:0;background:none;cursor:zoom-in}}.shot img{{display:block;width:100%;border:1px solid var(--line);border-radius:12px}}.boundaries{{padding:28px;margin-top:42px}}
#viewer{{border:0;padding:0;background:rgba(4,10,20,.92);max-width:none;max-height:none;width:100vw;height:100vh}}#viewer::backdrop{{background:rgba(4,10,20,.92)}}#viewer img{{display:block;max-width:94vw;max-height:90vh;margin:5vh auto;object-fit:contain}}#viewer button{{position:fixed;right:22px;top:18px;border:1px solid #fff5;background:#111a;color:white;border-radius:999px;padding:9px 14px;font-size:15px}}
.empty{{display:none;padding:40px;text-align:center;color:var(--muted)}}
@media(max-width:900px){{.layout{{display:block}}aside{{position:relative;height:auto}}aside nav{{display:flex;overflow:auto;gap:4px}}aside a{{white-space:nowrap}}main{{padding:22px 16px 60px}}.hero h2{{font-size:28px}}.workflow{{padding:20px}}.workflow-head{{display:block}}.number{{display:inline-block;margin-bottom:10px}}.objective,.result{{display:block}}.objective strong,.result strong{{display:block;margin-bottom:4px}}}}
@media print{{body{{background:#fff}}aside,.toolbar,#viewer{{display:none!important}}.layout{{display:block}}main{{width:auto;padding:0}}.hero{{box-shadow:none}}.workflow{{box-shadow:none;border:0;border-radius:0;break-after:page;margin:0;padding:16mm 12mm}}.workflow img{{max-height:132mm;object-fit:contain}}.chapter{{break-before:page}}}}
</style>
</head>
<body>
<div class="layout">
<aside><h1>MES-lite SOP</h1><p>v{VERSION} · {len(workflows)} 个流程</p><nav>{nav}<a href="#boundaries">治理边界</a></nav></aside>
<main>
<section class="hero"><h2>全流程作业指导书</h2><ul class="meta">{metadata_html}</ul><p class="notice">{html.escape(important)}</p></section>
<div class="toolbar"><input id="search" type="search" placeholder="搜索流程、岗位、单据、操作或结果…" autocomplete="off"><span id="count">{len(workflows)} / {len(workflows)}</span></div>
<div id="empty" class="empty">没有匹配流程，请更换关键词。</div>
{''.join(cards)}
<section class="boundaries" id="boundaries"><h2>暂不作为现行 SOP 的治理项</h2><ul>{boundaries_html}</ul></section>
</main>
</div>
<dialog id="viewer"><button type="button">关闭 Esc</button><img alt="放大截图"></dialog>
<script>
const input=document.querySelector('#search'),cards=[...document.querySelectorAll('.workflow')],count=document.querySelector('#count'),empty=document.querySelector('#empty');
input.addEventListener('input',()=>{{const terms=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);let visible=0;cards.forEach(card=>{{const show=terms.every(term=>card.dataset.search.includes(term));card.hidden=!show;if(show)visible++}});document.querySelectorAll('.chapter').forEach(ch=>{{let node=ch.nextElementSibling,any=false;while(node&&!node.classList.contains('chapter')){{if(node.classList.contains('workflow')&&!node.hidden)any=true;node=node.nextElementSibling}}ch.hidden=!any}});count.textContent=`${{visible}} / ${{cards.length}}`;empty.style.display=visible?'none':'block'}});
const viewer=document.querySelector('#viewer'),viewerImage=viewer.querySelector('img');document.querySelectorAll('.shot').forEach(button=>button.addEventListener('click',()=>{{viewerImage.src=button.querySelector('img').src;viewerImage.alt=button.querySelector('img').alt;viewer.showModal()}}));viewer.querySelector('button').addEventListener('click',()=>viewer.close());viewer.addEventListener('click',event=>{{if(event.target===viewer)viewer.close()}});
</script>
</body>
</html>"""
    output = OUTPUT / "index.html"
    output.write_text(page, encoding="utf-8")
    print(f"Created {output} with {len(workflows)} workflows and {len(copied)} images")
    return output


if __name__ == "__main__":
    build()
