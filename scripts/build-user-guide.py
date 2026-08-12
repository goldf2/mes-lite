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
VERSION = "0.1.351"
SCREENSHOT_BASELINE = "0.1.350"
DOCUMENT_FONT = "Arial Unicode MS"
SHOT_DIR = ROOT / "docs/operations/user-guide/screenshots" / f"v{SCREENSHOT_BASELINE}"
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
        "4. 派工与流程转移",
        [
            ("13-dispatch-list.png", "查看派工", "查看生产任务的人员和工作中心分配。", ["进入 MES > 生产 > 派工管理。", "按任务、人员或状态筛选。", "核对生产订单、工作中心和执行人员。"], "待处理派工及其来源订单可追溯。"),
            ("14-dispatch-create.png", "新建派工", "把已发布生产任务分配到员工和工作中心。", ["点击“新建派工”。", "选择生产订单、员工、工作中心和计划时间。", "填写要求并保存。"], "派工记录出现在列表并可跟踪状态。"),
            ("15-flow-transfer.png", "查看流程转移", "跟踪物料在流程节点或库位间的移动。", ["进入 MES > 生产 > 流程转移。", "搜索转移单号、物料或员工。", "核对来源库位、目标库位、数量和状态。"], "列表完整显示待处理与已完成转移。"),
            ("16-flow-transfer-create.png", "新建流程转移", "登记同一物料的现场流转。", ["点击“新建流程转移”。", "选择物料、来源库位、目标库位和数量。", "填写执行员工、节点和备注后保存。", "审批/完成后检查库位库存。"], "转移完成后总库存不变，库位分布变化。"),
        ],
    ),
    (
        "5. 来料与库存闭环",
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
        "6. 销售、发货与退货",
        [
            ("24-sales-order-list.png", "查看销售订单", "跟踪客户需求、占用、已发和未发数量。", ["进入 ERP > 销售 > 销售订单。", "搜索客户、订单号或物料。", "查看草稿、已确认、部分发货和完成状态。"], "订单数量与发货占用、已发和未发数量一致。"),
            ("25-sales-order-create.png", "新建销售订单", "登记客户需求、价格和交期。", ["点击“新建销售订单”。", "选择客户并填写订单日期、交期和客户单号。", "添加物料、数量、单价和附件。", "创建后复核并确认订单。"], "草稿订单生成，确认后才可用于关联发货。"),
            ("26-sales-order-detail.png", "复核销售订单详情", "在发货前核对客户和订单明细。", ["打开订单“详情”。", "核对客户、客户单号、日期、金额和附件。", "确认订购、待发占用、已发和未发数量。"], "详情与列表及原始凭据一致。"),
            ("27-shipment-list.png", "查看发货单", "查看待发、已发货和已签收记录。", ["进入 ERP > 销售 > 发货管理。", "按发货单、订单、客户或物流号搜索。", "核对发货库位、数量、价格和状态。"], "每张发货单可追溯销售订单和客户。"),
            ("28-shipment-create.png", "新建发货单", "建立独立或关联销售订单的发货任务。", ["点击“新建发货单”。", "选择销售订单或独立发货。", "选择客户、物料、发货库位并填写数量、价格和物流信息。", "保存后先保持待发货。"], "待发货记录生成并占用订单未发数量。"),
            ("29-shipment-confirm.png", "确认发货", "实际出库并扣减发货库位库存。", ["在待发货记录点击“发货”。", "核对库位库存和发货数量。", "确认后查看成功提示，可继续办理签收。"], "状态变为“已发货”，库存减少，销售订单已发数量增加。"),
            ("30-return-list.png", "查看退货单", "查看客户退货、原因和处理状态。", ["进入 ERP > 销售 > 退货管理。", "按退货单、物料、发货单或原因搜索。", "核对数量、退回库位和待处理状态。"], "退货可追溯原发货单和客户。"),
            ("31-return-create.png", "新建退货单", "登记客户退回物料。", ["点击“新建退货单”。", "选择物料并填写数量、退回库位和原因。", "按需填写外部凭据、备注和附件。", "保存后等待授权人员处理。"], "新单状态为“待处理”，库存尚未返库。"),
            ("32-return-processed.png", "处理退货返库", "确认退货接收并增加指定库位库存。", ["在待处理退货上点击“处理”。", "核对数量和退回库位。", "确认后检查成功提示、库存和流水。"], "状态变为“已处理”，退回库位库存增加。"),
        ],
    ),
    (
        "7. 文档与设备台账",
        [
            ("33-document-list.png", "查看受控文档", "按物料、客户和工作中心查找现场文件。", ["进入 MES > 文档 > 产品文档。", "按标题、正文、产品或备注搜索。", "点击“在线阅读”或“详情”查看版本和附件。"], "能确认文件标题、版本、状态和适用范围。"),
            ("34-document-create.png", "新建受控文档", "上传原文件或创建在线作业正文。", ["点击“新建文档”。", "上传原文件或填写在线正文。", "关联物料、类别、版本和工作中心。", "保存后在列表复核状态。"], "文档可按适用范围检索并保留原始附件。"),
            ("35-equipment-list.png", "查看设备台账", "维护设备状态、工作中心和能力参数。", ["进入 MES > 设备 > 设备台账。", "搜索设备编码、名称、型号或工作中心。", "核对设备状态和现场位置。"], "台账显示可用、使用中、维护中或停用状态。"),
            ("36-equipment-create.png", "新建设备", "建立设备基础台账。", ["点击“新建设备”。", "填写编码、名称、类型和工作中心。", "填写状态、位置、厂商、型号、参数和备注。", "保存后复核列表。"], "设备可用于后续事件、派工和产能关联。"),
        ],
    ),
    (
        "8. 业务主数据配置",
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
        "9. 系统、工具与权限",
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
    run._element.rPr.rFonts.set(qn("w:eastAsia"), DOCUMENT_FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


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
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), DOCUMENT_FONT)
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = RGBColor(30, 41, 59)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.05

    for name, size, color in [
        ("Title", 28, "0F172A"),
        ("Heading 1", 19, "0F3B5F"),
        ("Heading 2", 14, "075985"),
        ("Heading 3", 11, "0F172A"),
    ]:
        style = styles[name]
        style.font.name = DOCUMENT_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), DOCUMENT_FONT)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(4)
        style.paragraph_format.space_after = Pt(4)

    if "Figure Caption" not in styles:
        cap = styles.add_style("Figure Caption", WD_STYLE_TYPE.PARAGRAPH)
    else:
        cap = styles["Figure Caption"]
    cap.font.name = DOCUMENT_FONT
    cap._element.rPr.rFonts.set(qn("w:ascii"), DOCUMENT_FONT)
    cap._element.rPr.rFonts.set(qn("w:hAnsi"), DOCUMENT_FONT)
    cap._element.rPr.rFonts.set(qn("w:eastAsia"), DOCUMENT_FONT)
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
    table.autofit = False
    table.columns[0].width = Inches(9.55)
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
        ("截图基线", f"v{SCREENSHOT_BASELINE}（v{VERSION} 仅修复发布后实绩面板刷新并交付本手册）"),
        ("适用角色", "管理员、计划员、班组长、仓管、销售、质检和系统维护人员"),
        ("数据范围", "仅限本机 mes_lite_guide.db 临时演示数据"),
        ("编制日期", "2026-08-12"),
    ]
    for idx, (key, value) in enumerate(rows):
        table.cell(idx, 0).text = key
        table.cell(idx, 1).text = value
        set_cell_shading(table.cell(idx, 0), "E2E8F0")
        for run in table.cell(idx, 0).paragraphs[0].runs:
            set_run_font(run, 9.5, True, "0F172A")
        for run in table.cell(idx, 1).paragraphs[0].runs:
            set_run_font(run, 9.5)
    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p4.paragraph_format.space_before = Pt(18)
    run = p4.add_run("受控文档 · 操作前先确认权限、单据状态、物料、数量、单位与库位")
    set_run_font(run, 10, True, "B45309")


def add_front_matter(doc: Document) -> None:
    doc.add_page_break()
    doc.add_heading("使用说明与边界", level=1)
    add_banner(doc, "先建立主数据，再创建业务单据；先核对草稿，再执行会改变库存或状态的确认动作。", "DCFCE7", "166534")
    bullets = [
        "绿色/成功提示只是页面提交成功；关键业务还必须在库存流水、订单详情或操作记录中复核。",
        "归档、永久删除、库存调整、数据修复、权限修改和 AI 密钥配置仅限授权人员。",
        "业务员工和登录账号是两套对象：员工用于单据执行，账号用于登录；绑定账号不会自动授予权限。",
        "生产订单统一状态：草稿 -> 已发布 -> 生产中 -> 已完成，或在允许阶段取消。草稿不可登记实绩。",
        "本指导书不把尚未贯通的质量检验、批次/炉批、设备事件/OEE 写成现行操作。它们属于后续治理阶段。",
        "旧 Product 兼容入口和旧生产领料/报工/QC/入库接口不作为本指导书主流程；当前主流程使用 Material、已发布 BOM 和班后实绩。",
    ]
    for item in bullets:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(item)

    doc.add_heading("推荐业务顺序", level=2)
    flow = "单位/库位/员工/供应商/客户/工作中心 -> 物料 -> BOM/工艺路线 -> 生产订单/销售订单 -> 派工/来料/发货 -> 实绩/收货/退货 -> 库存与审计复核"
    add_banner(doc, flow)

    doc.add_heading("章节索引", level=2)
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
        ("3-4", "生产订单、实绩、派工、转移", "执行状态和现场记录一致"),
        ("5", "来料、库存、流水", "收发存可追溯"),
        ("6", "销售、发货、退货", "订单与库存闭环"),
        ("7-8", "文档、设备、业务配置", "基础数据可被业务引用"),
        ("9", "系统、工具、权限", "可配置、可审计、最小权限"),
    ]
    for row in chapter_rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = value
            for run in cells[i].paragraphs[0].runs:
                set_run_font(run, 8.5)


def add_instruction_page(doc: Document, chapter: str, item, figure_number: int) -> None:
    filename, title, objective, steps, result = item
    image_path = SHOT_DIR / filename
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    doc.add_page_break()
    h = doc.add_paragraph()
    h.paragraph_format.space_after = Pt(2)
    run = h.add_run(chapter)
    set_run_font(run, 10, True, "0284C7")
    doc.add_heading(title, level=2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r1 = p.add_run("目的：")
    set_run_font(r1, 9, True, "0F172A")
    r2 = p.add_run(objective)
    set_run_font(r2, 9)
    steps_p = doc.add_paragraph()
    steps_p.paragraph_format.space_after = Pt(3)
    for idx, step in enumerate(steps, start=1):
        run = steps_p.add_run(f"{idx}. {step}  ")
        set_run_font(run, 8.8)
    result_p = doc.add_paragraph()
    result_p.paragraph_format.space_after = Pt(3)
    rr1 = result_p.add_run("结果检查：")
    set_run_font(rr1, 8.8, True, "166534")
    rr2 = result_p.add_run(result)
    set_run_font(rr2, 8.8)
    picture_p = doc.add_paragraph()
    picture_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture_p.paragraph_format.space_after = Pt(0)
    picture = picture_p.add_run().add_picture(str(image_path), width=Inches(8.45))
    picture._inline.docPr.set("title", title)
    picture._inline.docPr.set("descr", f"MES-lite {title}页面操作截图")
    caption = doc.add_paragraph(style="Figure Caption")
    caption.add_run(f"图 {figure_number}  {title}（演示库截图：{filename}）")


def add_appendix(doc: Document) -> None:
    doc.add_page_break()
    doc.add_heading("附录 A：上线前岗位检查表", level=1)
    checks = [
        ("计划/生产", "物料、BOM、计划数量和日期已复核；订单发布后再执行"),
        ("班组", "员工、工作中心、实际投入/产出、库位和班后日期真实"),
        ("仓储", "收货、发货、退货和调整均有来源单据；完成后核对流水"),
        ("销售", "客户、价格、交期、客户单号与发货占用一致"),
        ("文控", "文档版本、状态、适用物料和工作中心正确"),
        ("管理员", "账号已审核；权限遵循最小权限；关键操作可审计"),
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
        row.height = Inches(0.43)
        cells = row.cells
        cells[0].text = role
        cells[1].text = check
        cells[2].text = ""
        for cell in cells:
            for run in cell.paragraphs[0].runs:
                set_run_font(run, 9)
    doc.add_heading("附录 B：暂不作为现行 SOP 的治理项", level=1)
    for item in [
        "质量：检验计划、检验结果、不合格品处置尚未与生产实绩和库存完整贯通。",
        "批次/炉批：来料批次、生产批次、成品批次和客户发货批次尚未形成端到端追溯链。",
        "设备事件：开停机、故障、维护、产量和 OEE 尚未形成统一事件流。",
        "模型收敛：旧 Product 与 Material 仍需分阶段迁移，当前禁止继续扩展旧模型写入口。",
    ]:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(item)
    add_banner(doc, "以上功能在完成数据模型、权限、回归测试和现场验证前，不应写入车间正式作业标准。", "FEF3C7", "92400E")


def build_docx(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    configure_section(doc)
    apply_styles(doc)
    doc.core_properties.title = "MES-lite 全流程作业指导书"
    doc.core_properties.subject = "MES-lite 业务操作与截图 SOP"
    doc.core_properties.author = "MES-lite 项目组"
    doc.core_properties.keywords = "MES-lite,MES,作业指导书,SOP"
    add_cover(doc)
    add_front_matter(doc)
    figure_number = 1
    for chapter, items in CHAPTERS:
        for item in items:
            add_instruction_page(doc, chapter, item, figure_number)
            figure_number += 1
    add_appendix(doc)
    doc.save(path)


def markdown_lines() -> Iterable[str]:
    yield "# MES-lite 全流程作业指导书"
    yield ""
    yield f"- 交付版本：v{VERSION}"
    yield f"- 截图基线：v{SCREENSHOT_BASELINE}"
    yield "- 数据范围：隔离本地演示库 `prisma/mes_lite_guide.db`，不含生产业务数据"
    yield "- 编制日期：2026-08-12"
    yield ""
    yield "> 重要：质量、批次/炉批、设备事件/OEE 尚未形成完整业务闭环，本指导书不把这些治理项描述为现行功能。"
    yield ""
    yield "## 推荐业务顺序"
    yield ""
    yield "单位/库位/员工/供应商/客户/工作中心 → 物料 → BOM/工艺路线 → 生产订单/销售订单 → 派工/来料/发货 → 实绩/收货/退货 → 库存与审计复核。"
    for chapter, items in CHAPTERS:
        yield ""
        yield f"## {chapter}"
        for filename, title, objective, steps, result in items:
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
            yield f"![{title}](screenshots/v{SCREENSHOT_BASELINE}/{filename})"
    yield ""
    yield "## 暂不作为现行 SOP 的治理项"
    yield ""
    yield "- 质量检验、不合格处置与库存尚未完整贯通。"
    yield "- 来料批次、生产批次、成品批次和发货批次尚未形成端到端追溯。"
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
