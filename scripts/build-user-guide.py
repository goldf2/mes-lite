#!/usr/bin/env python3
"""Build the screenshot-based MES-lite operator guide in Markdown and DOCX."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.360"
SCREENSHOT_BASELINE = "0.1.350"
QUALITY_SCREENSHOT_BASELINE = "0.1.354"
TRACE_SCREENSHOT_BASELINE = "0.1.355"
FULFILLMENT_SCREENSHOT_BASELINE = "0.1.356"
DISPOSITION_SCREENSHOT_BASELINE = "0.1.357"
PANORAMA_SCREENSHOT_BASELINE = "0.1.358"
ROLE_TASK_SCREENSHOT_BASELINE = "0.1.359"
FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE = "0.1.360"
DOCUMENT_FONT = "Arial Unicode MS"
EAST_ASIA_FONT = "Arial Unicode MS"
# compact_reference_guide 的横向现场截图覆盖：9.55in 固定表格，保留 120 DXA 左缩进。
TABLE_WIDTH_DXA = 13752
TABLE_INDENT_DXA = 120
SHOT_ROOT = ROOT / "docs/operations/user-guide/screenshots"
SOURCE_DIR = ROOT / "docs/operations/user-guide"
DOCX_DIR = ROOT / "output/docx"


CHAPTERS = [
    (
        "1. 登录与工作区导航",
        [
            ("01-login.png", "登录系统", "使用分配的操作员账号进入系统。", ["打开系统登录页。", "输入登录账号和密码。", "点击“登录”，等待工作台加载。"], "顶部显示当前人员名称，左侧出现有权限的功能菜单。"),
            ("02-dashboard.png", "查看工作台", "在班前确认生产、库存和待办概况。", ["进入 MES 工作区。", "查看常用功能、生产负荷和待处理事项。", "发现红色或橙色预警时进入对应功能核查。"], "统计卡片与当前演示业务数据一致。"),
            ("03-all-functions.png", "使用所有功能", "从完整功能目录进入业务页面。", ["在工作台点击“所有功能”。", "按业务分组找到目标功能。", "只会显示当前账号拥有权限的页面。"], "页面按物料、生产、物流、库存、配置、工具等分组。"),
            ("23-erp-all-functions.png", "切换 ERP 工作区", "进入销售、发货和退货业务。", ["点击左上角“ERP”工作区。", "点击“所有功能”。", "选择销售订单、发货管理或退货管理。"], "左侧菜单切换为 ERP 业务导航。"),
        ],
    ),
    (
        "2. 物料与 BOM 主数据",
        [
            ("04-material-list.png", "查询物料", "查询物料编码、规格、单位和库存概况。", ["进入 MES > 物料 > 物料管理。", "使用顶部搜索框输入编码、名称或规格。", "需要时切换列表/卡片视图并打开详情。"], "目标物料及库存单位正确显示。"),
            ("05-material-create.png", "新建物料", "建立可用于库存和生产的统一 Material 主数据。", ["点击“新建物料”。", "填写编码、名称、规格、分类、库存单位和主要计量方式。", "按需要填写默认价格、安全库存和客户。", "保存后返回列表复核。"], "新物料可被 BOM、订单、收发货等业务选择。"),
            ("06-bom-workspace.png", "进入 BOM 工作区", "查找物料并维护 BOM 版本。", ["进入 MES > 物料 > BOM 设置。", "搜索并选择目标产出物料。", "查看当前版本、状态、输入项和输出项。"], "BOM 工作区显示目标物料和版本状态。"),
            ("07-bom-detail.png", "维护并发布 BOM", "定义整批投入、主产出和副产出。", ["新建或打开草稿 BOM。", "填写基准产量、投入物料、数量和单位。", "维护主产出与副产出比例。", "校验无误后发布，生产只能引用已发布版本。"], "发布版本显示“已发布”，投入单位与物料计量方式一致。"),
        ],
    ),
    (
        "3. 生产订单与班后实绩",
        [
            ("08-production-order-list.png", "查看生产订单", "查看生产计划及统一状态。", ["进入 MES > 生产 > 生产订单。", "按订单号、物料或状态搜索。", "关注草稿、已发布、生产中、已完成和已取消状态。"], "列表显示计划数量、日期、BOM 和当前状态。"),
            ("09-production-order-create.png", "新建生产订单", "建立物料化生产计划。", ["点击“新建生产订单”。", "选择产出物料、已发布 BOM、计划数量和计划日期。", "填写班组或备注后保存。"], "订单以“草稿”创建，此时不可登记实绩。"),
            ("10-production-order-release.png", "发布生产订单", "将已复核计划转为可执行任务。", ["打开草稿订单详情。", "核对物料、数量、日期和 BOM。", "点击“发布订单”并确认。"], "状态由“草稿”变为“已发布”。"),
            ("11-production-order-released.png", "确认订单可执行", "确认发布后实绩入口已经解锁。", ["发布完成后重新查看订单详情。", "确认状态为“已发布”。", "确认“登记班后产量”按钮可用。"], "发布状态与操作按钮保持一致。"),
            ("12-production-actual-entry.png", "登记班后生产实绩", "按真实投入和产出记录班后实绩。", ["点击“登记班后产量”。", "填写员工、工作中心、实际日期和产出数量。", "按现场记录填写实际投入、主产出、副产出及库位。", "保存后核对实绩与库存流水。"], "实绩保存成功，投入与产出生成可追溯记录。"),
        ],
    ),
    (
        "4. 生产产出批次与质检",
        [
            ("66-production-quality-lots.png", "查看产出批次与质量状态", "从生产实绩核对内部批次、检验单和当前库存状态。", ["进入生产订单详情并展开已确认实绩。", "在每项产出下查看内部批次号和检验单号。", "区分待检、已放行和冻结状态。"], "每项新产出具有唯一内部批次，待检任务只允许判定一次。", QUALITY_SCREENSHOT_BASELINE),
            ("67-quality-pass-form.png", "填写合格判定", "记录抽样结果并准备整批放行。", ["在待检批次点击“合格放行”。", "录入抽检数量、合格数量和不合格数量。", "填写检验结论说明并核对批次号。"], "合格数量与不合格数量之和等于抽检数量，整批合格时不合格数为 0。", QUALITY_SCREENSHOT_BASELINE),
            ("68-quality-pass-result.png", "确认整批放行", "把检验合格的整批产出从待检转为可用。", ["点击“确认整批放行”。", "等待保存成功并刷新订单详情。", "核对批次状态、判定人和抽样结果。"], "批次显示“已放行”，待检库存减少、可用库存增加。", QUALITY_SCREENSHOT_BASELINE),
            ("69-quality-fail-form.png", "填写不合格判定", "记录不合格样本和冻结原因。", ["在另一待检批次点击“不合格冻结”。", "录入抽检、合格和不合格数量。", "在说明中写清不合格现象和冻结原因。"], "抽样关系校验通过，说明可供后续处置人员理解。", QUALITY_SCREENSHOT_BASELINE),
            ("70-quality-fail-result.png", "确认整批冻结", "阻止不合格产出进入领料或发货可用量。", ["点击“确认整批冻结”。", "等待保存成功并刷新订单详情。", "核对批次状态、判定人和抽样结果。"], "批次显示“冻结”，待检库存减少、冻结库存增加。", QUALITY_SCREENSHOT_BASELINE),
            ("71-inventory-status-review.png", "核对库存状态", "在库存总账复核质量判定后的可用、待检和冻结数量。", ["进入 MES > 库存 > 库存管理。", "搜索质检涉及的产出物料。", "核对总量、可用、待检、冻结及库位余额。"], "总库存等于可用、待检和冻结之和，质量判定不改变总量或总成本。", QUALITY_SCREENSHOT_BASELINE),
            ("72-inventory-quality-movements.png", "核对质量状态流水", "确认放行或冻结可以从统一库存流水回放。", ["进入 MES > 库存 > 库存流水。", "搜索产出物料或质量来源。", "核对 QUALITY RELEASE / QUALITY HOLD、批次、状态方向、操作人和时间。"], "状态转换流水数量变化为 0，但明确记录待检到可用或冻结的转换。", QUALITY_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "5. 质量任务与不合格处置",
        [
            ("89-quality-task-workbench.png", "进入质量任务工作台", "按车间待办集中查看待检和待处置批次。", ["进入 MES > 生产 > 质量任务。", "先查看待检任务数量，再查看待处置批次数量。", "按检验单、批次、物料或来源单据搜索。"], "页面显示待检、待处置和全部记录三个任务视图。", DISPOSITION_SCREENSHOT_BASELINE),
            ("90-quality-partial-form.png", "填写部分判定", "把同一待检批次按合格和不合格数量拆分。", ["在待检任务点击“部分判定”。", "填写抽检、合格和不合格样本数量。", "填写放行数量、冻结数量和结论说明。", "确认放行与冻结之和等于本轮待检数量。"], "表单通过样本关系和整批处置数量校验。", DISPOSITION_SCREENSHOT_BASELINE),
            ("91-quality-partial-result.png", "核对部分放行结果", "确认合格部分可用、不合格部分冻结。", ["提交部分判定后切换“待处置批次”。", "找到刚处理的内部批次。", "核对已放行、冻结、抽检结果和判定人。"], "同一批次同时显示已放行和冻结余额，总量与判定前一致。", DISPOSITION_SCREENSHOT_BASELINE),
            ("92-quality-disposition-history.png", "查看判定与处置记录", "审计同一批次的每次状态变化。", ["展开“判定与处置记录”。", "核对判定放行和判定冻结的数量。", "核对原因、操作人和独立处置编号。"], "每个动作都有独立、不可覆盖的质量处置记录。", DISPOSITION_SCREENSHOT_BASELINE),
            ("93-quality-reinspect-form.png", "申请复检", "从冻结库存抽取指定数量进入新一轮待检。", ["在冻结批次点击“申请复检”。", "填写处置数量。", "填写复检申请号、原因或审批依据。", "点击“确认送复检”。"], "指定数量由冻结转为待检，并生成新的检验轮次。", DISPOSITION_SCREENSHOT_BASELINE),
            ("94-quality-reinspect-result.png", "核对复检任务", "确认新一轮检验单与批次余额同步生成。", ["切换到“待检任务”。", "找到复检批次。", "核对冻结余量、待检数量、新检验单号和轮次。"], "页面显示第 2 轮检验单，原冻结余额按复检数量减少。", DISPOSITION_SCREENSHOT_BASELINE),
            ("95-quality-rework-complete-form.png", "返工完成送检", "把完成返工的数量重新送入质量检验。", ["在含返工余额的批次点击“返工完成送检”。", "填写本次完工数量。", "填写返工单号和完工说明。", "确认返工完成送检。"], "本次数量由返工中转为待检并生成复检任务。", DISPOSITION_SCREENSHOT_BASELINE),
            ("96-quality-rework-followup.png", "核对返工复检任务", "确认返工不会直接恢复为可用库存。", ["切换到“待检任务”。", "找到返工完成批次。", "核对冻结余量、待检数量和第 2 轮检验单。"], "返工完成数量保持待检隔离，必须再次质量判定。", DISPOSITION_SCREENSHOT_BASELINE),
            ("97-quality-rework-start-form.png", "转入返工", "把可返修的冻结数量转为返工中状态。", ["在冻结批次点击“转返工”。", "填写返工数量。", "填写返工单号、返工内容和审批依据。", "确认转返工。"], "冻结库存减少，返工中库存等量增加。", DISPOSITION_SCREENSHOT_BASELINE),
            ("98-quality-rework-start-result.png", "核对返工中状态", "确认返工库存不能被领料或发货。", ["提交转返工后留在待处置视图。", "核对冻结余额和返工中余额。", "展开处置记录核对返工动作。"], "返工中数量单独列示，不计入可用库存。", DISPOSITION_SCREENSHOT_BASELINE),
            ("99-quality-scrap-form.png", "提交质量报废", "从冻结库存中报废无法返修的数量。", ["在冻结批次点击“报废”。", "填写报废数量。", "填写报废审批号和原因。", "确认报废前再次核对批次与数量。"], "报废表单包含明确审批依据，且只能使用冻结余额。", DISPOSITION_SCREENSHOT_BASELINE),
            ("100-quality-scrap-result.png", "核对报废结果", "确认报废同步减少库存数量与批次成本。", ["提交报废后查看成功提示。", "核对冻结余额按报废数量减少。", "展开处置记录核对报废动作和审批号。", "在库存流水复核质量报废记录。"], "总库存与总成本按批次比例减少，处置历史保留。", DISPOSITION_SCREENSHOT_BASELINE),
            ("101-quality-concession-form.png", "执行让步放行", "依据客户偏差许可放行指定冻结数量。", ["具有授权放行权限的主管点击“让步放行”。", "填写数量。", "填写客户偏差许可号和适用条件。", "确认让步放行。"], "只有配置质量放行权限的人员可以提交。", DISPOSITION_SCREENSHOT_BASELINE),
            ("102-quality-concession-result.png", "核对让步放行结果", "确认让步数量恢复为可用并可追溯审批依据。", ["提交后核对已放行和冻结余额。", "展开处置记录。", "核对让步放行数量、操作人和偏差许可号。"], "可用库存增加、冻结库存等量减少，总库存和总成本不变。", DISPOSITION_SCREENSHOT_BASELINE),
            ("103-quality-unfreeze-form.png", "执行解冻放行", "在冻结原因已纠正后授权恢复可用。", ["具有授权放行权限的主管点击“解冻放行”。", "填写数量。", "填写解冻审批号、纠正措施和复核说明。", "确认解冻放行。"], "解冻原因和审批依据不能为空。", DISPOSITION_SCREENSHOT_BASELINE),
            ("104-quality-release-history.png", "核对授权放行历史", "从同一批次回放让步、解冻和初始判定。", ["提交解冻后展开处置历史。", "核对解冻放行和让步放行分别记录。", "向下核对初始判定冻结与放行记录。"], "四条动作各自保留数量、原因、人员和处置编号。", DISPOSITION_SCREENSHOT_BASELINE),
            ("105-inventory-quality-statuses.png", "核对五类库存状态", "在库存总账确认可用、待检、冻结和返工中守恒。", ["进入 MES > 库存 > 库存管理。", "搜索质量处置物料。", "核对总库存、预留、可用、待检、冻结和返工中。", "核对库位明细使用相同状态口径。"], "可用量等于总量减预留、待检、冻结和返工中；返工品不可出库。", DISPOSITION_SCREENSHOT_BASELINE),
            ("106-quality-permission-layers.png", "配置质量操作权限", "按岗位拆分查看、判定、处置和授权放行权限。", ["进入账号与权限 > 组权限。", "分别配置质量任务查看、质量判定、复检/返工/报废处置、让步/解冻放行。", "按岗位只勾选必要的查、增、改权限。", "保存后使用目标账号复核菜单和按钮。"], "检验员、处置人员和质量主管的高风险操作可以分离授权。", DISPOSITION_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "6. 来料到生产批次谱系",
        [
            ("73-receipt-internal-lot.png", "核对来料内部批次", "确认收货后的内部批号与供应商炉批号并存。", ["进入 MES > 物流 > 来料管理。", "打开状态为“已收货”的来料单详情。", "在物料明细的批次列同时核对供应批号和内部批号。"], "内部批号以 RM- 开头，供应批号与原始单据一致。", TRACE_SCREENSHOT_BASELINE),
            ("74-receipt-lot-trace.png", "查看原料批次追溯", "从来料批次查看来源、库位余额和下游产出。", ["在已收货来料明细点击“查看谱系”。", "核对当前批次的物料、来源单据和各库位可用余额。", "查看右侧下游产出批次数量。"], "来料批次无上游；已投入生产时可看到下游产出。", TRACE_SCREENSHOT_BASELINE),
            ("75-production-trace-confirm.png", "确认生产批次谱系", "在改变库存前复核 FIFO 分配和谱系生成的事务边界。", ["打开已发布生产订单的班后实绩。", "在待确认实绩点击“确认并更新库存”。", "阅读弹窗中的投入扣减、FIFO、产出待检和整笔回滚提示。", "无误后点击“确认并生成批次谱系”。"], "库存不足时整笔不生效；成功时实绩转为已确认。", TRACE_SCREENSHOT_BASELINE),
            ("76-production-input-allocations.png", "核对投入批次分配", "核对本次实绩实际消耗的内部批次、供应批号和数量。", ["确认完成后等待实绩卡片刷新。", "在“投入物料”中查看批次明细。", "核对内部批号、供应批号、库位和分配数量。", "展开产出卡的“投入批次谱系”复核父批次。"], "各投入分配合计等于本次实际投入，产出谱系显示同一来源批次。", TRACE_SCREENSHOT_BASELINE),
            ("77-output-lot-trace.png", "从产出批次反查上游", "从成品内部批次反查所有投入和供应商炉批。", ["在产出批次卡点击“查看谱系”。", "在中间核对产出批号、质检单和待检余额。", "在左侧核对所有投入批次、物料和分配数量。"], "产出批次能反查原料内部批号和供应批号。", TRACE_SCREENSHOT_BASELINE),
            ("78-source-lot-downstream.png", "从原料批次正查下游", "沿相邻谱系节点返回原料批次并查看全部下游产出。", ["在产出追溯弹窗点击左侧原料批次。", "确认中间当前批次已切换为来料批次。", "在右侧查看所有相邻下游产出，需要时可继续点击。"], "同一原料批次对应的多个生产产出均可查看，弹窗不重叠。", TRACE_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "7. 派工与流程转移",
        [
            ("13-dispatch-list.png", "查看派工", "查看生产任务的人员和工作中心分配。", ["进入 MES > 生产 > 派工管理。", "按任务、人员或状态筛选。", "核对生产订单、工作中心和执行人员。"], "待处理派工及其来源订单可追溯。"),
            ("14-dispatch-create.png", "新建派工", "把已发布生产任务分配到员工和工作中心。", ["点击“新建派工”。", "选择生产订单、员工、工作中心和计划时间。", "填写要求并保存。"], "派工记录出现在列表并可跟踪状态。"),
            ("15-flow-transfer.png", "查看流程转移", "跟踪物料在流程节点或库位间的移动。", ["进入 MES > 生产 > 流程转移。", "搜索转移单号、物料或员工。", "核对来源库位、目标库位、数量和状态。"], "列表完整显示待处理与已完成转移。"),
            ("16-flow-transfer-create.png", "新建流程转移", "登记同一物料的现场流转。", ["点击“新建流程转移”。", "选择物料、来源库位、目标库位和数量。", "填写执行员工、节点和备注后保存。", "审批/完成后检查库位库存。"], "转移完成后总库存不变，库位分布变化。"),
        ],
    ),
    (
        "8. 来料与库存闭环",
        [
            ("17-receiving-list.png", "查看来料单", "查看供应商来料及收货状态。", ["进入 MES > 物流 > 来料管理。", "按单号、供应商或物料搜索。", "核对采购数量、实测数据、计价和状态。"], "待收货与已收货单据清晰区分。"),
            ("18-receiving-create.png", "新建来料单", "登记供应商原材料到货。", ["点击“新建来料单”。", "选择供应商、物料、收货库位。", "填写数量、实测重量、单价、凭据和附件。", "创建后保留为待收货，等待现场确认。"], "来料单生成，但库存尚未增加。"),
            ("19-receiving-received.png", "确认收货", "确认实物到厂并增加指定库位库存。", ["在待收货记录上点击“收货”。", "再次核对物料、数量和库位。", "确认操作后查看成功提示。"], "状态变为“已收货”，库存和流水同步增加。"),
            ("20-stock-list.png", "查看库存", "按物料和库位核对库存、占用和可用量。", ["进入 MES > 库存 > 库存管理。", "搜索目标物料。", "展开库位分布并核对总量、占用、可用和成本。"], "物料总库存等于各库位库存合计。"),
            ("21-stock-adjustment.png", "库存调整", "在授权和有凭据时纠正账实差异。", ["在库存记录中点击“调整”。", "选择库位并填写调整后数量或调整差额。", "填写原因和凭据，确认保存。", "立即进入库存流水复核来源。"], "调整生成独立流水，不覆盖历史业务单据。"),
            ("22-stock-movements.png", "核对库存流水", "追溯每次数量和成本变化。", ["进入 MES > 库存 > 库存流水。", "按物料、业务类型、时间或来源单据筛选。", "核对来料、发货、退货、调整和生产实绩记录。"], "流水数量、库位和来源单据能相互对应。"),
        ],
    ),
    (
        "9. 销售、发货与退货",
        [
            ("24-sales-order-list.png", "查看销售订单", "跟踪客户需求、占用、已发和未发数量。", ["进入 ERP > 销售 > 销售订单。", "搜索客户、订单号或物料。", "查看草稿、已确认、部分发货和完成状态。"], "订单数量与发货占用、已发和未发数量一致。"),
            ("25-sales-order-create.png", "新建销售订单", "登记客户需求、价格和交期。", ["点击“新建销售订单”。", "选择客户并填写订单日期、交期和客户单号。", "添加物料、数量、单价和附件。", "创建后复核并确认订单。"], "草稿订单生成，确认后才可用于关联发货。"),
            ("26-sales-order-detail.png", "复核销售订单详情", "在发货前核对客户和订单明细。", ["打开订单“详情”。", "核对客户、客户单号、日期、金额和附件。", "确认订购、待发占用、已发和未发数量。"], "详情与列表及原始凭据一致。"),
            ("27-shipment-list.png", "查看发货单", "查看待发、已发货和已签收记录。", ["进入 ERP > 销售 > 发货管理。", "按发货单、订单、客户或物流号搜索。", "核对发货库位、数量、价格和状态。"], "每张发货单可追溯销售订单和客户。"),
            ("28-shipment-create.png", "新建发货单", "建立独立或关联销售订单的发货任务。", ["点击“新建发货单”。", "选择销售订单或独立发货。", "选择客户、物料、发货库位并填写数量、价格和物流信息。", "保存后先保持待发货。"], "待发货记录生成并占用订单未发数量。"),
            ("29-shipment-confirm.png", "确认发货", "实际出库并扣减发货库位库存。", ["在待发货记录点击“发货”。", "核对库位库存和发货数量。", "确认后查看成功提示，可继续办理签收。"], "状态变为“已发货”，库存减少，销售订单已发数量增加。"),
            ("79-shipment-list-tracked.png", "核对发货批次追踪状态", "确认已发货或已签收单据已经记录真实内部批次，而不是只有总库存扣减。", ["进入 ERP > 销售 > 发货管理。", "找到已签收发货单并核对客户、物料、库位和数量。", "打开“详情”，确认“客户发货批次”的追溯状态为“真实内部批次”。"], "发货单状态正确，批次卡片显示内部批次号、发出数量、已退数量和发货库位。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("80-shipment-detail-lot-allocation.png", "查看客户发货批次分配", "核对出库数量按可用库存批次分配，并保留客户去向。", ["在已发货/已签收发货单点击“详情”。", "向下查看“客户发货批次”。", "逐条核对内部批次、发出数量、已退数量和库位。"], "分配合计等于发货数量；历史未追踪库存会明确标为兼容批次，不伪造成来料或生产批次。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("81-shipment-customer-genealogy.png", "从发货批次查看客户去向", "从内部批次正向确认发货单、客户、物流和退货累计。", ["在客户发货批次点击“查看谱系”。", "查看“客户履约追溯 > 客户发货去向”。", "核对发货单、客户编码/名称、发出数量、已退数量、库位和物流号。"], "客户发货去向显示对应发货记录；尚未收货的退货不会提前形成回流批次。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("30-return-list.png", "查看退货单", "查看客户退货、原因和处理状态。", ["进入 ERP > 销售 > 退货管理。", "按退货单、物料、发货单或原因搜索。", "核对数量、退回库位和待处理状态。"], "退货可追溯原发货单和客户。"),
            ("31-return-create.png", "新建退货单", "登记客户退回物料。", ["点击“新建退货单”。", "选择物料并填写数量、退回库位和原因。", "按需填写外部凭据、备注和附件。", "保存后等待授权人员处理。"], "新单状态为“待处理”，库存尚未返库。"),
            ("82-return-create-source-shipment.png", "按原发货单登记可退数量", "在界面中复核原发货单是必选项，避免退货脱离客户和出库批次。", ["点击“新建退货单”。", "在“原发货单”选择目标单据。", "核对自动带出的客户、物料和“剩余可退”提示。", "选择退货待检库位后再填写数量和原因。"], "仅显示仍可退的发货单；物料不可随意替换，数量上限等于剩余可退数量。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("32-return-processed.png", "处理退货返库", "确认退货接收并增加指定库位库存。", ["在待处理退货上点击“处理”。", "核对数量和退回库位。", "确认后检查成功提示、库存和流水。"], "状态变为“已处理”，退回库位库存增加。"),
            ("83-return-received-status.png", "确认退货已收货", "核对业务单状态与库存质量状态分离。", ["在待收货退货单点击“处理”。", "等待成功提示并刷新列表。", "核对退货状态为“已收货”。"], "列表显示已收货，但这不代表批次已可用；必须继续完成质量判定。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("84-return-source-and-pending-quality.png", "核对原发货批次与退货待检批次", "确认退回数量从原发货批次分配，并形成独立、可质检的退货批次。", ["打开已收货退货单“详情”。", "查看“原发货批次来源”，核对原批次、本次退回数量、发货单和库位。", "查看“退货待检批次”，核对批次号、待检状态、状态数量和检验单号。"], "来源分配合计等于退货数量；退货批次号以 RT- 开头且质量状态为待检。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("85-return-lot-source-genealogy.png", "从退货批次反查原发货", "从退货回流批次反向定位客户、原发货单和原出库批次。", ["在退货待检批次点击“查看谱系”。", "查看当前批次说明与质量检验单。", "在“客户退货来源”核对原批次、退货单、原发货单、客户和退回数量。"], "退货批次显示原发货单和客户；来源内部批次可继续点击追溯。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("86-return-quality-pass-form.png", "填写退货批次合格判定", "对已收货退货批次执行整批质量放行。", ["在退货详情点击“合格放行”。", "填写抽检数量、合格数量、不合格数量和结论说明。", "确认合格数与不合格数之和等于抽检数，且整批合格时不合格数为 0。", "点击“确认整批放行”。"], "系统保存检验人、判定和抽检结果，并把整批库存由待检转为可用。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("87-return-quality-released.png", "核对退货批次已放行", "确认质量结果和库存状态已经同步落账。", ["提交质量判定后留在退货详情。", "核对批次状态从“待检”变为“已放行”。", "核对判定、抽检、合格、不合格数量和检验人。"], "批次显示“已放行”，状态数量保持不变，质量判定信息完整。", FULFILLMENT_SCREENSHOT_BASELINE),
            ("88-source-lot-return-descendant.png", "从原发货批次查看退货回流", "从原出库批次正向确认客户退回数量及其最终质量状态。", ["从退货批次谱系点击来源内部批次。", "查看“客户发货去向”，核对发出数量和已退累计。", "查看“退货回流批次”，核对退货批次、状态、数量、库位、退货单和客户。"], "原发货批次显示发出和已退累计；回流批次显示最终质量状态，并关联原发货单和退货原因。", FULFILLMENT_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "10. 文档与设备台账",
        [
            ("33-document-list.png", "查看受控文档", "按物料、客户和工作中心查找现场文件。", ["进入 MES > 文档 > 产品文档。", "按标题、正文、产品或备注搜索。", "点击“在线阅读”或“详情”查看版本和附件。"], "能确认文件标题、版本、状态和适用范围。"),
            ("34-document-create.png", "新建受控文档", "上传原文件或创建在线作业正文。", ["点击“新建文档”。", "上传原文件或填写在线正文。", "关联物料、类别、版本和工作中心。", "保存后在列表复核状态。"], "文档可按适用范围检索并保留原始附件。"),
            ("35-equipment-list.png", "查看设备台账", "维护设备状态、工作中心和能力参数。", ["进入 MES > 设备 > 设备台账。", "搜索设备编码、名称、型号或工作中心。", "核对设备状态和现场位置。"], "台账显示可用、使用中、维护中或停用状态。"),
            ("36-equipment-create.png", "新建设备", "建立设备基础台账。", ["点击“新建设备”。", "填写编码、名称、类型和工作中心。", "填写状态、位置、厂商、型号、参数和备注。", "保存后复核列表。"], "设备可用于后续事件、派工和产能关联。"),
        ],
    ),
    (
        "11. 业务主数据配置",
        [
            ("37-business-config-menu.png", "进入业务配置", "按顺序建立业务运行依赖的主数据。", ["展开 MES 的“业务配置”。", "建议依次维护单位、库位、员工、工作中心、工艺、路线和文档类别。", "ERP 工作区维护供应商、客户和企业规则。"], "业务单据下拉项来自已启用主数据。"),
            ("38-employee-list.png", "查看员工资料", "区分业务员工与登录账号。", ["进入员工资料。", "核对员工编码、部门、电话、账号绑定和在职状态。", "员工用于派工、实绩和转移，账号绑定不授予权限。"], "员工与账号关系清晰且无重复绑定。"),
            ("39-employee-create.png", "新建员工", "建立业务执行人员。", ["点击“新建员工”。", "填写姓名、部门和电话。", "按需绑定注册账号；权限仍在权限模块设置。", "保存后系统生成员工编码。"], "员工可被业务单据选择。"),
            ("40-location-config.png", "查看库位配置", "维护库存实物分布和默认库位。", ["进入库位配置。", "核对编码、名称、启用状态、物料数和库存。", "默认库位必须保持启用。"], "各库位库存分布与库存管理一致。"),
            ("41-location-create.png", "新建库位", "建立收发存可选的现场位置。", ["点击“新建库位”。", "填写唯一编码、名称和备注。", "仅在确有需要时设为默认库位。"], "启用库位可被来料、生产、转移、发货和退货选择。"),
            ("42-unit-config.png", "查看单位配置", "维护长度、重量、数量和其他计量目录。", ["进入单位配置。", "核对单位编码、显示名称、计量方式和换算系数。", "已被引用的单位不要随意改变换算关系。"], "物料单位与计量方式保持一致。"),
            ("43-unit-create.png", "新建自定义单位", "添加系统未预置的计量单位。", ["点击“新建单位”。", "选择计量方式并填写编码和显示名称。", "准确填写到系统基准单位的换算系数。", "保存前由业务负责人复核。"], "自定义单位可选且换算定义明确。"),
            ("44-document-category.png", "维护文档类别", "建立受控文件的一级/二级分类。", ["进入文档类别。", "新建或编辑分类名称和层级。", "已有文档引用的分类优先停用，不直接删除。"], "文档建档时可选择正确分类。"),
            ("45-work-center.png", "查看工作中心", "维护生产能力区域。", ["进入工作中心。", "核对编码、名称、类别、设备和工艺文档关联。", "停用前确认没有正在执行的任务。"], "工作中心与设备、工艺引用一致。"),
            ("46-work-center-create.png", "新建工作中心", "建立生产、检验或包装能力区域。", ["点击“新建工作中心”。", "填写编码、名称、类别和说明。", "保存后再关联设备和适用文档。"], "工作中心可在派工、实绩和设备台账中使用。"),
            ("47-process-template.png", "维护加工工艺模板", "建立可复用的工艺与成本参数。", ["进入加工工艺。", "新建或编辑工艺编码、名称、类别和工作中心。", "维护千件人工、机时和成本参数。"], "工艺模板可加入物料路线。"),
            ("48-material-route.png", "查看物料工艺路线", "查看物料的有序工序。", ["进入物料路线。", "搜索目标物料。", "核对默认路线、工序号、工序名称、工位和设备。"], "默认路线及工序顺序正确。"),
            ("49-material-route-create.png", "新建物料工艺路线", "为物料建立有序加工步骤。", ["点击“新建工艺路线”。", "选择物料并填写路线名称。", "按顺序添加工序或引用工艺模板。", "设置默认路线并保存。"], "路线可被工程和执行流程引用。"),
            ("50-supplier-list.png", "查看供应商", "维护来料业务的供应商档案。", ["切换 ERP > 业务配置 > 供应商资料。", "核对编码、名称、联系人、电话和状态。", "停用前确认没有未完成来料。"], "来料单可选择启用供应商。"),
            ("51-supplier-create.png", "新建供应商", "建立供应商基础资料。", ["点击“新建供应商”。", "填写名称、联系人、电话、地址和备注。", "保存后在供应商列表复核。"], "供应商可用于来料登记。"),
            ("52-customer-list.png", "查看客户", "维护销售、库存和发货筛选所需客户档案。", ["进入 ERP > 业务配置 > 客户资料。", "核对编码、名称、联系人、电话和地址。", "归档前确认没有未完成订单。"], "客户可被销售订单和发货单选择。"),
            ("53-customer-create.png", "新建客户", "建立客户基础资料。", ["点击“新建客户”。", "填写名称、联系人、电话、地址和备注。", "保存后在客户列表复核。"], "客户可用于销售订单。"),
            ("54-business-settings.png", "设置企业与业务规则", "维护发货单乙方资料和全局业务规则。", ["进入“企业与业务规则”。", "填写企业名称、联系人、电话和地址并保存。", "变更全局排序规则前评估所有客户端影响。"], "发货 PDF 乙方信息和业务列表规则正确。"),
        ],
    ),
    (
        "12. 系统、工具与权限",
        [
            ("55-display-settings.png", "显示设置", "配置界面配色、对比度和显示效果。", ["进入系统设置 > 显示设置。", "调整主题和显示选项。", "保存后刷新并检查可读性。"], "设置对当前客户端或系统范围按页面说明生效。"),
            ("56-navigation-settings.png", "导航与工作区设置", "配置页面在 MES/MRP/ERP 的唯一归属和顺序。", ["进入导航与工作区。", "调整页面归属、名称和顺序。", "保存后逐个工作区核对菜单。"], "每个页面仅在一个工作区出现，导航符合现场任务流。"),
            ("57-ai-settings.png", "AI 服务设置", "配置兼容模型连接和助手外观。", ["进入系统设置 > AI 服务。", "选择提供商并填写接口、模型和超时。", "API Key 依赖服务器密钥保护；保存前遵守页面安全提示。", "测试已保存配置后再开放给用户。"], "配置测试通过，密钥不在页面或日志中明文泄露。"),
            ("58-saw-cost.png", "锯切成本计算", "估算锯切、损耗和直接加工成本。", ["进入工具 > 锯切成本。", "填写材料、尺寸、数量、损耗和工时参数。", "核对计算结果并按业务要求留存。"], "计算口径与报价/工艺约定一致。"),
            ("59-hardware-tools.png", "扫码计数与标签打印", "验证扫码枪计数和浏览器标签打印底座。", ["进入工具 > 硬件工具。", "扫码计数：填写任务与目标条码，创建会话后扫描。", "标签打印：填写条码、名称、规格、数量和介质尺寸。", "先做测试打印并校准纸张；当前打印机 IP 仅保存配置。"], "扫码计数正确，测试标签尺寸和条码可读。"),
            ("60-archive-records.png", "管理归档记录", "恢复误归档记录或执行受控清理。", ["进入工具 > 归档记录。", "按业务类型查找记录。", "优先恢复；永久删除前确认依赖、备份和授权。"], "恢复后记录回到业务列表；永久删除有审计记录。"),
            ("61-audit-log.png", "查看操作记录", "追溯关键业务和系统变更。", ["进入工具 > 操作记录。", "按人员、动作、资源或时间筛选。", "将异常操作与来源单据、库存流水交叉核对。"], "关键修改可以定位到人员、时间和对象。"),
            ("62-data-tools.png", "执行数据检查", "预检关键数据关系并仅处理明确安全的问题。", ["进入工具 > 数据工具。", "先点击“重新检查”。", "查看阻塞、警告和可安全修复项。", "修改/清理前备份，完成后再次检查。"], "检查无阻塞问题；所有维护动作写入审计记录。"),
            ("63-operator-management.png", "人员管理", "审核、启停和维护登录人员。", ["进入账号与权限 > 人员管理。", "核对账号、姓名、角色、审核和启用状态。", "离职或异常账号应及时停用。"], "只有已审核且启用的账号能够登录。"),
            ("64-user-permissions.png", "配置个人权限", "为指定人员分配权限组和个人例外权限。", ["进入账号与权限 > 人员权限。", "选择人员并分配权限组。", "仅在必要时增加个人权限。", "保存后用该账号复核可见菜单和操作。"], "人员实际权限符合岗位最小权限原则。"),
            ("65-group-permissions.png", "配置权限组", "维护可复用的岗位权限集合。", ["进入账号与权限 > 组权限。", "选择或新建权限组。", "按资源勾选查看、新建、编辑、归档、删除。", "保存后复核组内人员。"], "同岗位人员获得一致、可审计的权限。"),
        ],
    ),
    (
        "13. 跨业务批次追溯全景",
        [
            ("107-lot-panorama-entry.png", "进入批次追溯全景", "从统一入口按任意业务线索查找内部批次。", ["进入 MES > 库存 > 批次追溯。", "确认顶部搜索支持供应批号、内部批号、物料、供应商、来料/生产/检验/发货/退货单和客户。", "确认页面显示单次 100 条结果、300 个关联批次的安全上限。"], "页面处于空态，不会在没有搜索线索时加载全库关系。", PANORAMA_SCREENSHOT_BASELINE),
            ("108-lot-panorama-supplier-search.png", "按供应批号定位来料批次", "从供应商炉批号定位系统内部来料批次。", ["在顶部搜索框输入供应批号 HEAT-SCM435-20260812-R1。", "在左侧匹配结果核对命中依据为“供应批号”。", "核对内部批号、物料、来料单和供应商名称。"], "搜索结果只显示匹配批次，供应批号与原始来料信息一致。", PANORAMA_SCREENSHOT_BASELINE),
            ("109-lot-panorama-supplier-production.png", "展开供应到生产全景", "正向查看同一来料批次参与的全部生产转换和质量状态。", ["点击匹配的来料内部批次。", "核对关联批次、转换关系、供应批次、客户和质量检验汇总。", "横向查看当前批次与下游生产批次。", "核对每个产出批次的工单、实绩、库存余额和质量状态。"], "来料批次能正向展开全部有效生产谱系，转换数量和质量任务可审计。", PANORAMA_SCREENSHOT_BASELINE),
            ("110-lot-panorama-customer-search.png", "按客户定位发货与退货批次", "从客户名称定位实际发货批次和退货回流批次。", ["将搜索词改为客户名称“昆山装配制造有限公司”。", "核对结果同时包含客户发货来源生产批次和已收货退货批次。", "确认切换搜索词后旧全景已经清空，避免误读。"], "搜索结果标明命中依据为客户或退货单，右侧等待重新选择。", PANORAMA_SCREENSHOT_BASELINE),
            ("111-lot-panorama-return-reverse.png", "从退货批次反查供应来源", "从客户退货待检批次反向展开原发货、生产投入和供应批号。", ["选择退货内部批次 RT-RT-20260812-002。", "核对当前批次的待检状态和退货检验单。", "向左查看原发货生产批次，再继续查看原料/辅料投入。", "在底部核对客户、发货单、发出数量和已退数量。"], "退货批次可反查到原发货、生产批次、工单、来料内部批号和供应批号。", PANORAMA_SCREENSHOT_BASELINE),
            ("112-lot-panorama-adjacent-detail.png", "查看相邻批次追溯明细", "对全景中的单个节点查看相邻关系与客户退货原因。", ["在目标批次卡点击“查看相邻明细”。", "核对当前批次、质量与库存状态。", "在客户退货来源中核对原发货批次、退货单、客户、数量和原因。", "需要时点击相邻批次继续逐节点核查。"], "相邻明细与全景汇总一致，弹窗内可沿关系继续导航。", PANORAMA_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "14. 岗位任务台与操作权限",
        [
            ("113-role-task-workbench.png", "查看生产主管任务台", "按当前账号的服务端权限优先查看生产待办。", ["使用生产主管账号登录并进入 MES 仪表盘。", "在页面首屏查看待发布订单、可登记实绩订单和待确认实绩。", "核对每个任务数量与下方业务统计。"], "生产主管只收到其可执行的发布、登记和确认任务。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("114-role-task-direct-filter.png", "直达待发布生产订单", "从任务卡直接进入已筛选的业务清单。", ["在生产主管任务台点击“待发布订单”。", "确认系统打开生产订单页。", "核对状态筛选自动设为“草稿”，且地址保留任务参数。"], "列表只展示待发布订单，不需要再次手工设置状态。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("115-quality-role-workbench.png", "查看质检员任务台", "让质检岗位只看到允许执行的质量任务。", ["使用质检员账号登录并进入 MES 仪表盘。", "查看“我的质量任务”。", "核对质检员只显示待检任务，不显示处置或授权放行任务。"], "任务入口与质量判定权限一致，未授权动作不会出现在任务台。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("116-quality-task-direct.png", "直达待检质量任务", "从质检员任务卡进入待检视图并使用公共搜索。", ["在质检员任务台点击“待检任务”。", "确认打开质量任务工作台且默认选中待检任务。", "使用顶部搜索框按检验单、批次、物料或来源单据检索。"], "页面只显示待检记录，判定按钮与当前岗位权限一致。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("117-warehouse-role-workbench.png", "查看仓管员任务台", "集中处理仓库收货、发货和退货待办。", ["使用仓管员账号登录并进入 MES 仪表盘。", "查看“我的仓储任务”。", "核对待收货、待发货和退货待处理数量。"], "仓管任务按单据状态汇总，未授权的生产和质量命令不显示。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("118-warehouse-task-direct.png", "直达待收货来料单", "从仓储任务卡进入已筛选的来料清单。", ["在仓管员任务台点击“待收货”。", "确认系统打开来料管理页。", "核对状态自动筛选为“待收货”。"], "列表只显示需要当前仓储岗位处理的待收货单。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("119-production-command-permissions.png", "配置生产命令权限", "把发布、实绩登记、实绩确认和冲销拆成独立授权。", ["使用管理员账号进入账号与权限 > 组权限。", "选择生产管理或计划岗位组。", "分别核对生产订单发布、生产实绩登记、生产实绩确认和生产实绩冲销四个资源。", "保存后使用目标岗位账号复核任务入口、按钮和 API 结果。"], "四类高风险命令可独立授权；前端按钮和服务端接口使用相同门禁。", ROLE_TASK_SCREENSHOT_BASELINE),
            ("120-mobile-role-task-workbench.png", "在手机端处理岗位待办", "让车间人员在窄屏首屏直接看到本人任务。", ["将浏览器或手持终端调整为手机宽度。", "使用生产主管账号进入 MES 仪表盘。", "先处理顶部岗位任务卡，再按需展开导航或下方统计。"], "390 像素宽度下任务卡完整可读、可点击，不需要先穿过多级菜单。", ROLE_TASK_SCREENSHOT_BASELINE),
        ],
    ),
    (
        "15. 细粒度权限与岗位边界",
        [
            ("121-fine-grained-permission-sections.png", "按业务域查看细粒度权限", "在 48 项资源中快速定位要配置的业务权限。", ["使用管理员进入账号与权限 > 组权限。", "选择目标权限组。", "按公共入口、生产质量、物料工艺、来料销售、人员运维和升级兼容分区核对。", "只修改岗位实际需要的动作。"], "权限矩阵按业务域分区展示，新增、编辑、归档和授权动作可独立配置。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("122-bom-structure-permission.png", "分开配置 BOM 结构与成本", "避免工艺工程师因维护 BOM 结构而自动获得成本权限。", ["在组权限中选择工艺技术组。", "定位物料、工艺与设备分区。", "为 BOM 结构与版本配置必要动作。", "保持 BOM 成本关闭，除非岗位确需查看成本。"], "BOM 结构与版本和 BOM 成本是两个独立资源，工艺组可维护结构而不能读取成本。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("123-process-engineer-bom-workspace.png", "使用工艺岗位维护 BOM", "让工艺工程师只进入工艺相关页面并维护 BOM。", ["使用工艺工程师账号登录。", "进入物料 > BOM 设置。", "新建或选择 BOM 草稿，维护投入、产出与方案名称。", "核对左侧没有销售、系统设置和权限管理菜单。"], "工艺岗位可新建和维护 BOM，非工艺业务入口不会显示。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("124-warehouse-flow-transfer.png", "使用仓库岗位执行流程转移", "让仓库主管独立执行库位转移，不获得统计维护权限。", ["使用仓库主管账号登录。", "进入生产 > 流程转移。", "核对已有转移单并按需新建。", "确认账号没有统计分析维护入口。"], "流程转移按 flowTransfers 资源授权，可与 stats 统计权限分别控制。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("125-sales-customer-management.png", "使用销售岗位维护客户", "让销售跟单人员维护客户和履约资料，不进入员工或系统配置。", ["使用销售发运账号登录并切换 ERP。", "进入业务配置 > 客户资料。", "查询、新建或编辑客户。", "核对员工、AI、归档和权限管理入口不可见。"], "销售岗位可维护客户、订单、发货与退货，其他主数据和系统设置保持隔离。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("126-personnel-employee-management.png", "使用人事岗位维护员工", "把员工业务档案和其他业务主数据分开授权。", ["使用人事管理员账号登录并切换 MES。", "进入业务配置 > 员工资料。", "新建或编辑员工，并按需绑定登录账号。", "核对客户、库位、工艺和系统设置入口不可见。"], "人事岗位可维护员工与账号状态，但不会自动获得生产、销售或系统配置权限。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("127-ai-settings-readonly.png", "只读核对 AI 服务配置", "允许运维观察员查看 AI 配置状态而不能修改密钥或模型。", ["使用 AI 配置只读账号登录。", "进入系统设置 > AI 服务。", "核对启用开关、提供商、接口、模型和密钥状态。", "确认所有字段禁用，且没有保存、测试或图标调参按钮。"], "aiSettings 只读权限仅展示配置；页面动作和写接口均不可用。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("128-permission-admin-boundary.png", "使用权限管理员维护赋权", "把安全赋权职责与业务、系统运维职责分开。", ["使用权限管理员账号登录。", "进入账号与权限 > 组权限。", "维护权限组或人员赋权并保存。", "尝试进入企业规则、AI、数据工具等页面并确认被留在已授权页面。"], "权限管理员可维护人员赋权和组权限，但不会自动获得业务数据或系统配置权限。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
            ("129-mobile-permission-admin.png", "在手机端核对权限组", "在窄屏设备上查看岗位组和权限矩阵。", ["将浏览器或手持终端调整到手机宽度。", "使用权限管理员账号进入组权限。", "选择目标岗位组并纵向浏览资源分区。", "涉及批量赋权时仍建议在桌面端完成并复核。"], "375 像素宽度下岗位组可选择、矩阵可阅读，底部导航不会遮挡当前内容。", FINE_GRAINED_PERMISSION_SCREENSHOT_BASELINE),
        ],
    ),
]


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size: float | None = None, bold: bool | None = None, color: str | None = None) -> None:
    run.font.name = DOCUMENT_FONT
    run._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), EAST_ASIA_FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def set_table_geometry(table, widths_dxa: list[int]) -> None:
    if sum(widths_dxa) != TABLE_WIDTH_DXA:
        raise ValueError(f"表格列宽合计必须为 {TABLE_WIDTH_DXA} DXA：{widths_dxa}")
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(TABLE_WIDTH_DXA))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(TABLE_INDENT_DXA))
    tbl_ind.set(qn("w:type"), "dxa")
    tbl_layout = tbl_pr.find(qn("w:tblLayout"))
    if tbl_layout is None:
        tbl_layout = OxmlElement("w:tblLayout")
        tbl_pr.append(tbl_layout)
    tbl_layout.set(qn("w:type"), "fixed")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        grid_col = OxmlElement("w:gridCol")
        grid_col.set(qn("w:w"), str(width))
        grid.append(grid_col)

    for row in table.rows:
        for index, cell in enumerate(row.cells):
            width = widths_dxa[min(index, len(widths_dxa) - 1)]
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            tc_mar = tc_pr.find(qn("w:tcMar"))
            if tc_mar is None:
                tc_mar = OxmlElement("w:tcMar")
                tc_pr.append(tc_mar)
            for side, value in (("top", 80), ("bottom", 80), ("start", 120), ("end", 120)):
                margin = tc_mar.find(qn(f"w:{side}"))
                if margin is None:
                    margin = OxmlElement(f"w:{side}")
                    tc_mar.append(margin)
                margin.set(qn("w:w"), str(value))
                margin.set(qn("w:type"), "dxa")
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0


def add_numbering_definition(doc: Document, kind: str) -> int:
    numbering = doc.part.numbering_part.element
    abstract_ids = [int(node.get(qn("w:abstractNumId"))) for node in numbering.findall(qn("w:abstractNum"))]
    num_ids = [int(node.get(qn("w:numId"))) for node in numbering.findall(qn("w:num"))]
    abstract_id = max(abstract_ids, default=0) + 1
    num_id = max(num_ids, default=0) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)
    level = OxmlElement("w:lvl")
    level.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    level.append(start)
    num_fmt = OxmlElement("w:numFmt")
    num_fmt.set(qn("w:val"), "bullet" if kind == "bullet" else "decimal")
    level.append(num_fmt)
    level_text = OxmlElement("w:lvlText")
    level_text.set(qn("w:val"), "•" if kind == "bullet" else "%1.")
    level.append(level_text)
    level_justification = OxmlElement("w:lvlJc")
    level_justification.set(qn("w:val"), "left")
    level.append(level_justification)
    p_pr = OxmlElement("w:pPr")
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), "540")
    tabs.append(tab)
    p_pr.append(tabs)
    indent = OxmlElement("w:ind")
    indent.set(qn("w:left"), "540")
    indent.set(qn("w:hanging"), "271")
    p_pr.append(indent)
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:after"), "80")
    spacing.set(qn("w:line"), "300")
    spacing.set(qn("w:lineRule"), "auto")
    p_pr.append(spacing)
    level.append(p_pr)
    abstract.append(level)
    numbering.append(abstract)

    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def add_list_paragraph(doc: Document, text: str, num_id: int, *, size: float = 11, compact: bool = False):
    paragraph = doc.add_paragraph()
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num_id_node = OxmlElement("w:numId")
    num_id_node.set(qn("w:val"), str(num_id))
    num_pr.append(ilvl)
    num_pr.append(num_id_node)
    p_pr.append(num_pr)
    # 截图步骤页使用紧凑覆盖，其余列表保持 preset 的 4pt / 1.25。
    paragraph.paragraph_format.space_after = Pt(0 if compact else 4)
    paragraph.paragraph_format.line_spacing = 0.95 if compact else 1.25
    set_run_font(paragraph.add_run(text), size)
    return paragraph


def add_page_number(paragraph) -> None:
    run = paragraph.add_run("第 ")
    set_run_font(run, 8, color="64748B")
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, end])
    run2 = paragraph.add_run(" 页")
    set_run_font(run2, 8, color="64748B")


def apply_styles(doc: Document) -> None:
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = DOCUMENT_FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), EAST_ASIA_FONT)
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor(30, 41, 59)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    for name, size, color, before, after in [
        ("Title", 28, "0F172A", 0, 3),
        ("Heading 1", 16, "2E74B5", 18, 10),
        ("Heading 2", 13, "2E74B5", 14, 7),
        ("Heading 3", 12, "1F4D78", 10, 5),
    ]:
        style = styles[name]
        style.font.name = DOCUMENT_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), EAST_ASIA_FONT)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)

    if "Figure Caption" not in styles:
        cap = styles.add_style("Figure Caption", WD_STYLE_TYPE.PARAGRAPH)
    else:
        cap = styles["Figure Caption"]
    cap.font.name = DOCUMENT_FONT
    cap._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
    cap._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
    cap._element.rPr.rFonts.set(qn("w:eastAsia"), EAST_ASIA_FONT)
    cap.font.size = Pt(8)
    cap.font.italic = True
    cap.font.color.rgb = RGBColor(71, 85, 105)
    cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_before = Pt(2)
    cap.paragraph_format.space_after = Pt(1)


def configure_section(doc: Document) -> None:
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Inches(11)
    section.page_height = Inches(8.5)
    section.top_margin = Inches(0.5)
    section.bottom_margin = Inches(0.5)
    section.left_margin = Inches(0.65)
    section.right_margin = Inches(0.65)
    section.header_distance = Inches(0.22)
    section.footer_distance = Inches(0.22)

    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(f"MES-lite  全流程作业指导书  |  v{VERSION}")
    set_run_font(run, 8, True, "0F3B5F")
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_number(fp)


def add_banner(doc: Document, text: str, fill: str = "E0F2FE", color: str = "075985") -> None:
    table = doc.add_table(rows=1, cols=1)
    set_repeat_table_header(table.rows[0])
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_geometry(table, [TABLE_WIDTH_DXA])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    set_run_font(run, 9.5, True, color)


def add_cover(doc: Document) -> None:
    doc.add_paragraph("")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("MES-lite")
    set_run_font(run, 18, True, "0284C7")
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p2.add_run("全流程作业指导书")
    set_run_font(run, 30, True, "0F172A")
    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p3.add_run("从主数据到生产、库存与销售闭环")
    set_run_font(run, 15, False, "475569")
    doc.add_paragraph("")
    add_banner(doc, "本指导书基于隔离的本地演示数据库和真实页面操作截图制作；不含生产业务数据。")
    doc.add_paragraph("")
    table = doc.add_table(rows=5, cols=2)
    set_repeat_table_header(table.rows[0])
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    rows = [
        ("交付版本", f"v{VERSION}"),
        ("截图基线", "v0.1.350-v0.1.360 的 129 张真实页面流程截图"),
        ("适用角色", "管理员、计划员、班组长、工艺、仓管、销售、人事、质检和系统维护人员"),
        ("数据范围", "仅限本机 mes_lite_guide.db 临时演示数据"),
        ("编制日期", "2026-08-13"),
    ]
    for idx, (key, value) in enumerate(rows):
        table.cell(idx, 0).text = key
        table.cell(idx, 1).text = value
        set_cell_shading(table.cell(idx, 0), "E2E8F0")
        for run in table.cell(idx, 0).paragraphs[0].runs:
            set_run_font(run, 9.5, True, "0F172A")
        for run in table.cell(idx, 1).paragraphs[0].runs:
            set_run_font(run, 9.5)
    set_table_geometry(table, [2700, 11052])
    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p4.paragraph_format.space_before = Pt(18)
    run = p4.add_run("受控文档 · 操作前先确认权限、单据状态、物料、数量、单位与库位")
    set_run_font(run, 10, True, "B45309")


def add_front_matter(doc: Document, bullet_num_id: int) -> None:
    doc.add_page_break()
    front_heading = doc.add_heading("使用说明与边界", level=1)
    front_heading.paragraph_format.space_before = Pt(4)
    front_heading.paragraph_format.space_after = Pt(4)
    add_banner(doc, "先建立主数据，再创建业务单据；先核对草稿，再执行会改变库存或状态的确认动作。", "DCFCE7", "166534")
    bullets = [
        "绿色/成功提示只是页面提交成功；关键业务还必须在库存流水、订单详情或操作记录中复核。",
        "归档、永久删除、库存调整、数据修复、权限修改和 AI 密钥配置仅限授权人员。",
        "业务员工和登录账号是两套对象：员工用于单据执行，账号用于登录；绑定账号不会自动授予权限。",
        "生产订单统一状态：草稿 -> 已发布 -> 生产中 -> 已完成，或在允许阶段取消。草稿不可登记实绩。",
        "供应商批号、来料内部批次、生产投入、产出批次、客户发货、退货回流、质量判定与不合格处置已贯通；48 项细粒度资源、岗位任务和生产命令权限已落地，但数据范围尚未完成；生产上线前仍须在服务器维护窗口完成备份、迁移、岗位权限和真实业务验收。",
        "旧 Product 兼容入口和旧生产领料/报工/QC/入库接口不作为本指导书主流程；当前主流程使用 Material、已发布 BOM 和班后实绩。",
    ]
    for item in bullets:
        add_list_paragraph(doc, item, bullet_num_id, size=9.5, compact=True)

    flow_heading = doc.add_heading("推荐业务顺序", level=2)
    flow_heading.paragraph_format.space_before = Pt(4)
    flow_heading.paragraph_format.space_after = Pt(3)
    flow = "单位/库位/员工/供应商/客户/工作中心 -> 物料 -> BOM/工艺路线 -> 生产订单/销售订单 -> 派工/来料/发货 -> 实绩 -> 质量判定/处置/复检 -> 收货/退货 -> 库存与审计复核"
    add_banner(doc, flow)

    index_heading = doc.add_heading("章节索引", level=2)
    index_heading.paragraph_format.space_before = Pt(4)
    index_heading.paragraph_format.space_after = Pt(3)
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["章节", "业务范围", "关键结果"]
    for i, h in enumerate(headers):
        table.cell(0, i).text = h
        set_cell_shading(table.cell(0, i), "0F3B5F")
        for run in table.cell(0, i).paragraphs[0].runs:
            set_run_font(run, 9, True, "FFFFFF")
    set_repeat_table_header(table.rows[0])
    chapter_rows = [
        ("1", "登录、工作台、MES/ERP 导航", "进入正确工作区"),
        ("2", "物料与 BOM", "统一主数据和已发布 BOM"),
        ("3-6", "生产订单、实绩、质检、批次谱系、派工、转移", "投入、产出和质量状态可回放"),
        ("7", "来料、库存、流水", "收发存可追溯"),
        ("8", "销售、发货、退货", "订单与库存闭环"),
        ("9-10", "文档、设备、业务配置", "基础数据可被业务引用"),
        ("11", "系统、工具、权限", "可配置、可审计、最小权限"),
    ]
    for row in chapter_rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = value
            for run in cells[i].paragraphs[0].runs:
                set_run_font(run, 8.5)
    set_table_geometry(table, [1200, 6276, 6276])


def normalize_item(item):
    filename, title, objective, steps, result, *baseline = item
    return filename, title, objective, steps, result, (baseline[0] if baseline else SCREENSHOT_BASELINE)


def add_instruction_page(doc: Document, chapter: str, item, figure_number: int) -> None:
    filename, title, objective, steps, result, screenshot_baseline = normalize_item(item)
    image_path = SHOT_ROOT / f"v{screenshot_baseline}" / filename
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    doc.add_page_break()
    h = doc.add_paragraph()
    h.paragraph_format.space_before = Pt(0)
    h.paragraph_format.space_after = Pt(2)
    run = h.add_run(chapter)
    set_run_font(run, 10, True, "0284C7")
    step_heading = doc.add_heading(title, level=2)
    step_heading.paragraph_format.space_before = Pt(0)
    step_heading.paragraph_format.space_after = Pt(2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r1 = p.add_run("目的：")
    set_run_font(r1, 9, True, "0F172A")
    r2 = p.add_run(objective)
    set_run_font(r2, 9)
    number_num_id = add_numbering_definition(doc, "decimal")
    for step in steps:
        add_list_paragraph(doc, step, number_num_id, size=8.4, compact=True)
    result_p = doc.add_paragraph()
    result_p.paragraph_format.space_after = Pt(3)
    rr1 = result_p.add_run("结果检查：")
    set_run_font(rr1, 8.8, True, "166534")
    rr2 = result_p.add_run(result)
    set_run_font(rr2, 8.8)
    picture_p = doc.add_paragraph()
    picture_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture_p.paragraph_format.space_after = Pt(0)
    picture_p.paragraph_format.keep_with_next = True
    picture = picture_p.add_run().add_picture(str(image_path), height=Inches(4.3))
    picture._inline.docPr.set("title", title)
    picture._inline.docPr.set("descr", f"MES-lite {title}页面操作截图")
    caption = doc.add_paragraph(style="Figure Caption")
    caption.paragraph_format.keep_together = True
    caption.add_run(f"图 {figure_number}  {title}（演示库截图：{filename}）")


def add_appendix(doc: Document, bullet_num_id: int) -> None:
    doc.add_page_break()
    appendix_a_heading = doc.add_heading("附录 A：上线前岗位检查表", level=1)
    appendix_a_heading.paragraph_format.space_before = Pt(4)
    appendix_a_heading.paragraph_format.space_after = Pt(4)
    checks = [
        ("计划/生产", "物料、BOM、计划数量和日期已复核；订单发布后再执行"),
        ("班组", "员工、工作中心、实际投入/产出、库位和班后日期真实"),
        ("仓储", "收货、发货、退货和调整均有来源单据；完成后核对流水"),
        ("销售", "客户、价格、交期、客户单号与发货占用一致"),
        ("文控", "文档版本、状态、适用物料和工作中心正确"),
        ("质检", "批次号、抽样结果和结论已核对；整批放行/冻结后复核库存状态与流水"),
        ("管理员", "账号已审核；质量和生产高风险命令使用独立权限；关键操作可审计；任务数量与岗位数据范围已复核"),
        ("运维", "操作前备份；恢复演练通过；密钥不进代码和截图"),
    ]
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_repeat_table_header(table.rows[0])
    for i, h in enumerate(["岗位", "检查要点", "签字/日期"]):
        table.cell(0, i).text = h
        set_cell_shading(table.cell(0, i), "0F3B5F")
        for run in table.cell(0, i).paragraphs[0].runs:
            set_run_font(run, 9, True, "FFFFFF")
    for role, check in checks:
        row = table.add_row()
        cells = row.cells
        cells[0].text = role
        cells[1].text = check
        cells[2].text = ""
        for cell in cells:
            for run in cell.paragraphs[0].runs:
                set_run_font(run, 9)
    set_table_geometry(table, [1900, 9252, 2600])
    appendix_b_heading = doc.add_heading("附录 B：暂不作为现行 SOP 的治理项", level=1)
    appendix_b_heading.paragraph_format.space_before = Pt(6)
    appendix_b_heading.paragraph_format.space_after = Pt(4)
    for item in [
        "权限：岗位任务和生产命令动作已经分层；本人、班组/工作中心、仓库/库位数据范围仍待建设，正式上线前须以真实岗位账号复核可见数据。",
        "质量：业务闭环已贯通；正式上线前仍须按企业审批制度配置检验员、处置人员与质量主管权限，并验证真实不合格评审单据。",
        "批次/炉批：供应商、来料、生产投入产出、客户发货和退货回流已形成谱系；跨工厂或供应商系统集成尚未纳入本阶段。",
        "设备事件：开停机、故障、维护、产量和 OEE 尚未形成统一事件流。",
        "模型收敛：旧 Product 与 Material 仍需分阶段迁移，当前禁止继续扩展旧模型写入口。",
    ]:
        add_list_paragraph(doc, item, bullet_num_id, size=9.2, compact=True)
    add_banner(doc, "以上功能在完成数据模型、权限、回归测试和现场验证前，不应写入车间正式作业标准。", "FEF3C7", "92400E")


def build_docx(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    configure_section(doc)
    apply_styles(doc)
    bullet_num_id = add_numbering_definition(doc, "bullet")
    doc.core_properties.title = "MES-lite 全流程作业指导书"
    doc.core_properties.subject = "MES-lite 业务操作与截图 SOP"
    doc.core_properties.author = "MES-lite 项目组"
    doc.core_properties.keywords = "MES-lite,MES,作业指导书,SOP"
    add_cover(doc)
    add_front_matter(doc, bullet_num_id)
    figure_number = 1
    for chapter, items in CHAPTERS:
        for item in items:
            add_instruction_page(doc, chapter, item, figure_number)
            figure_number += 1
    add_appendix(doc, bullet_num_id)
    doc.save(path)


def markdown_lines() -> Iterable[str]:
    yield "# MES-lite 全流程作业指导书"
    yield ""
    yield f"- 交付版本：v{VERSION}"
    yield "- 截图基线：v0.1.350-v0.1.360（129 张真实页面流程截图）"
    yield "- 数据范围：隔离本地临时演示库，不含生产业务数据"
    yield "- 编制日期：2026-08-13"
    yield ""
    yield "> 重要：供应商批号、来料内部批次、生产投入产出、客户发货、退货回流、质量判定、不合格处置和跨批次搜索全景已贯通；48 项细粒度资源、岗位任务台和四类生产命令权限已落地，但尚未包含本人、部门、工作中心或库位数据范围；本机临时数据与截图不等于真实 Coolify 服务器已部署。"
    yield ""
    yield "## 推荐业务顺序"
    yield ""
    yield "单位/库位/员工/供应商/客户/工作中心 → 物料 → BOM/工艺路线 → 生产订单/销售订单 → 派工/来料/发货 → 实绩 → 质量判定/处置/复检 → 收货/退货 → 库存与审计复核。"
    for chapter, items in CHAPTERS:
        yield ""
        yield f"## {chapter}"
        for item in items:
            filename, title, objective, steps, result, screenshot_baseline = normalize_item(item)
            yield ""
            yield f"### {title}"
            yield ""
            yield f"目的：{objective}"
            yield ""
            for idx, step in enumerate(steps, start=1):
                yield f"{idx}. {step}"
            yield ""
            yield f"结果检查：{result}"
            yield ""
            yield f"![{title}](screenshots/v{screenshot_baseline}/{filename})"
    yield ""
    yield "## 暂不作为现行 SOP 的治理项"
    yield ""
    yield "- 质量闭环与岗位动作权限已贯通；正式上线前仍须按企业审批制度配置岗位权限、数据范围并使用真实不合格评审单验收。"
    yield "- 供应商、来料、生产投入产出、发货和退货回流已形成可搜索全景；跨工厂或供应商系统集成不在本阶段。"
    yield "- 岗位任务和生产命令动作已经分层；本人、班组/工作中心、仓库/库位数据范围仍待建设。"
    yield "- 设备开停机、故障、维护、产量和 OEE 尚未形成统一事件流。"
    yield "- 旧 Product 与 Material 仍需分阶段迁移，禁止继续扩展旧模型写入口。"


def build_markdown(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(markdown_lines()) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", type=Path, default=DOCX_DIR / f"MES-lite全流程作业指导书-v{VERSION}.docx")
    parser.add_argument("--markdown", type=Path, default=SOURCE_DIR / f"MES-lite全流程作业指导书-v{VERSION}.md")
    args = parser.parse_args()
    build_markdown(args.markdown)
    build_docx(args.docx)
    print(f"Created {args.markdown}")
    print(f"Created {args.docx}")


if __name__ == "__main__":
    main()
