import type { MaterialReference } from '../contracts'

export default function MaterialReferenceButton({
  material,
  onOpen,
  showImage = false,
}: {
  material: MaterialReference
  onOpen: (material: MaterialReference) => void
  showImage?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(material)}
      className="group -m-1 block max-w-full rounded p-1 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      title={`查看物料详情：${material.code} · ${material.name}`}
      aria-label={`查看物料详情：${material.code} · ${material.name}`}
    >
      <span className="flex items-center gap-2">
        {showImage && material.primaryImage && <img src={material.primaryImage.thumbnailUrl || material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-10 w-10 shrink-0 rounded border border-gray-200 bg-gray-50 object-cover" />}
        <span className="min-w-0">
          <span className="block font-medium text-gray-900 group-hover:text-blue-700 group-hover:underline group-hover:underline-offset-2">{material.name}</span>
          <span className="block text-xs text-gray-500 group-hover:text-blue-600">{material.code}{material.spec ? ` · ${material.spec}` : ''}</span>
        </span>
      </span>
    </button>
  )
}
