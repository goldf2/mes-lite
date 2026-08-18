import { useEffect, useState } from 'react'
import type { Material, MaterialReference } from '../contracts'
import { findMaterialByCode } from '../client'

export default function useMaterialDetail(
  material: Material | MaterialReference | null,
  onMessage: (message: string) => void,
) {
  const [detail, setDetail] = useState<Material | null>(material && 'createdAt' in material ? material : null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fallback = material && 'createdAt' in material ? material : null
    setDetail(fallback)
    setLoadFailed(false)
    if (!material) return () => { cancelled = true }

    findMaterialByCode(material.code, material.id)
      .then((latest) => {
        if (cancelled) return
        if (latest) setDetail(latest)
        else if (!fallback) setLoadFailed(true)
      })
      .catch((error) => {
        if (cancelled || fallback) return
        setLoadFailed(true)
        onMessage(error instanceof Error ? error.message : '获取物料详情失败')
      })

    return () => { cancelled = true }
  }, [material, onMessage])

  return { detail, loadFailed }
}
