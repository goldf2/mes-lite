# AI 接手提示词

把下面提示词复制到任何 AI 平台，可以帮助对方快速接手。更多按类别整理的常用提示词见 `PROMPT_LIBRARY.md`。

## 只读接手提示词

```text
你正在接手一个已有软件项目。请先阅读项目根目录的 AGENTS.md，然后阅读 docs/00-handoff/CURRENT_STATE.md、NEXT_ACTIONS.md、RUNBOOK.md、MODEL_AND_EVAL.md、QUALITY_GATE.md、SECURITY_AND_PRIVACY.md、CONTEXT_INDEX.md。

请完成以下事项：

1. 用不超过 10 条要点复述你对项目目标、当前状态、运行方式、AI 能力、质量门禁、安全边界、下一步任务和风险的理解。
2. 列出你认为需要优先确认的 3 个问题。
3. 在我确认前，不要修改任何文件。
```

## 开发接手提示词

```text
你正在接手一个已有软件项目。请先阅读 AGENTS.md 和 docs/00-handoff/ 下的交接文档。

接下来请从 NEXT_ACTIONS.md 中选择最高优先级、当前最适合执行的任务，并按以下流程工作：

1. 按 WORKFLOW.md 完成任务开始前检查。
2. 修改前确认现有运行和测试方式。
3. 保持改动范围小，沿用项目现有风格。
4. 完成后按 QUALITY_GATE.md 运行相关测试或手动验证。
5. 如果发现长期风险，更新 RISK_REGISTER.md。
6. 更新 docs/00-handoff/CURRENT_STATE.md 和 SESSION_LOG.md。
7. 最后总结改动、验证结果、遗留问题和下一步建议。
```

## 代码审查提示词

```text
你正在审查一个已有软件项目。请先阅读 AGENTS.md 和 docs/00-handoff/CURRENT_STATE.md。

请以代码审查方式输出：

1. 优先列出可能导致 bug、数据丢失、安全问题、性能问题或回归的问题。
2. 每个问题给出文件路径、具体位置、影响和建议修复方式。
3. 如果没有发现高风险问题，请明确说明。
4. 不要做大段重构建议，除非它直接影响当前风险。
```
