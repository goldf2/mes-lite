import type { MaterialChoice, ProcessRoute, ProcessRouteForm, ProcessTemplate, ProcessTemplateForm } from '../contracts/production-engineering'

async function readData<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallbackMessage)
  return payload.data || []
}

export async function loadProcessTemplates() {
  return readData<ProcessTemplate[]>(await fetch('/api/process-templates'), '获取加工工艺失败')
}

export async function loadEngineeringMaterials() {
  return readData<Array<{ id: string; code: string; name: string }>>(await fetch('/api/materials?pageSize=200&sortBy=code&sortDir=asc'), '获取关联物料失败')
}

export async function saveProcessTemplate(form: ProcessTemplateForm, editingId?: string) {
  return readData<ProcessTemplate>(await fetch('/api/process-templates', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...form, id: editingId, defaultTime: Number(form.defaultTime || 0), yieldRate: form.yieldRate / 100 }),
  }), '保存加工工艺失败')
}

export async function loadProcessRoutes() {
  return readData<ProcessRoute[]>(await fetch('/api/process-routes'), '获取工艺路线失败')
}

export async function loadEngineeringProducts() {
  return readData<MaterialChoice[]>(await fetch('/api/products'), '获取物料失败')
}

export async function saveProcessRoute(form: ProcessRouteForm, editingId?: string) {
  return readData<ProcessRoute>(await fetch('/api/process-routes', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: editingId,
      ...form,
      steps: form.steps.map((step) => ({
        ...step,
        stepNo: Number(step.stepNo),
        defaultTime: Number(step.defaultTime || 0),
        workstation: step.workstation || undefined,
        description: step.description || undefined,
        templateId: step.templateId || undefined,
        templateCode: step.templateCode || undefined,
      })),
    }),
  }), '保存工艺路线失败')
}
