import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AiAssistantAppearanceProvider } from './components/AiAssistantAppearanceProvider'
import { getPublishedAiAssistantMarkConfig } from '@/lib/ai-assistant-mark-settings'
import { getSystemSettings } from '@/lib/system-settings'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MES-lite 工厂生产系统',
  description: '机械配件工厂生产全流程记录系统',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [markAppearance, systemSettings] = await Promise.all([
    getPublishedAiAssistantMarkConfig(),
    getSystemSettings(),
  ])

  return (
    <html lang="zh-CN" data-mes-contrast={systemSettings.contrastMode}>
      <body className="bg-gray-50 text-gray-900">
        <AiAssistantAppearanceProvider
          initialConfig={markAppearance.config}
          initialLoadingIndicatorEnabled={systemSettings.aiLoadingIndicatorEnabled}
        >
          {children}
        </AiAssistantAppearanceProvider>
      </body>
    </html>
  )
}
