import LoginSettingsPage from '@/modules/identity-access/ui/LoginSettingsPage'
import SystemSettingsPageShell from '@/modules/system-settings/ui/SystemSettingsPageShell'
export default function Page() {
  return <main className="mx-auto w-full max-w-5xl p-4 sm:p-6"><SystemSettingsPageShell resourceKey="loginSettings" title="登录设置" description="统一身份登录与现有 MES 业务账号分别授权。"><LoginSettingsPage /></SystemSettingsPageShell></main>
}
