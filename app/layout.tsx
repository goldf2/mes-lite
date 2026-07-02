import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MES-lite 工厂生产系统',
  description: '机械配件工厂生产全流程记录系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
