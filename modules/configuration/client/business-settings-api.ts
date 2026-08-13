export interface BusinessSettingsView {
  naturalMaterialCodeSortEnabled: boolean
  companyName: string
  companyContact: string
  companyPhone: string
  companyAddress: string
}

type BusinessSettingsPatch = Partial<BusinessSettingsView>

async function readResponse(response: Response, fallbackMessage: string): Promise<BusinessSettingsView> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallbackMessage)
  return payload.data
}

export async function loadBusinessSettings() {
  return readResponse(await fetch('/api/system/settings?scope=business'), '获取企业与业务规则失败')
}

export async function updateBusinessSettings(patch: BusinessSettingsPatch) {
  return readResponse(await fetch('/api/system/settings?scope=business', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }), '保存企业与业务规则失败')
}
