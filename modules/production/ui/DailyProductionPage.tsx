'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { DailyInventoryCountPage } from '@/modules/inventory'
import DailyProductionBomEntry from './DailyProductionBomEntry'

export default function DailyProductionPage({ canUpdate, onMessage }: { canUpdate: boolean; onMessage: (message: string) => void }) {
  const [mode, setMode] = useState<'production' | 'count'>('production')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <AppButton variant={mode === 'production' ? 'primary' : 'secondary'} onClick={() => setMode('production')}>BOM 生产转换</AppButton>
        <AppButton variant={mode === 'count' ? 'primary' : 'secondary'} onClick={() => setMode('count')}>库存盘点校准</AppButton>
      </div>
      {mode === 'production'
        ? <DailyProductionBomEntry canUpdate={canUpdate} onMessage={onMessage} />
        : <DailyInventoryCountPage canUpdate={canUpdate} onMessage={onMessage} />}
    </div>
  )
}
