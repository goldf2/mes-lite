const navigationGlyphs: Record<string, string> = {
  dashboard: '仪',
  allFunctions: '全',
  orders: '工',
  materials: '料',
  workInstructions: '书',
  equipment: '机',
  materialIn: '入',
  dispatch: '派',
  stocks: '库',
  salesOrders: '销',
  shipment: '发',
  return: '退',
  stats: '报',
  flowTransfers: '转',
  sawingCost: '锯',
  scanPrint: '扫',
  suppliers: '供',
  customers: '客',
  employees: '员',
  processTemplates: '艺',
  processRoutes: '线',
  archive: '档',
  auditLogs: '记',
  dataTools: '数',
  unitSettings: '单',
  documentCategories: '类',
  locationSettings: '位',
  workCenters: '中',
  businessSettings: '业',
  displaySettings: '显',
  navigationSettings: '导',
  aiSettings: '智',
  operators: '人',
  permissionUsers: '权',
  permissionGroups: '组',
  permissions: '限',
}

export default function NavigationGlyph({ icon }: { icon: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
      {navigationGlyphs[icon] || '单'}
    </span>
  )
}

export function compactNavigationLabel(label: string) {
  return label
    .replace('管理', '')
    .replace('统计分析', '统计')
    .replace('仪表盘', '仪表')
}
