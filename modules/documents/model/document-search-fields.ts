import { defineResourceSearchCatalog, resourceAdvancedFields } from '@/lib/resource-search'
import type { ResourceAdvancedSearchField, ResourceSearchFieldType, ResourceSearchOperator, ResourceSearchValue } from '@/lib/resource-search'
import type { DocumentFieldDefinitionRecord, DocumentFieldType } from '../contracts/document-field-schema'
import type { WorkInstruction } from '../contracts/work-instruction'
import { documentBaseFieldDefinitions, parseFieldOptions } from '../domain/document-field-rules'
import { instructionStatusOptions } from './work-instruction-view'

const baseFieldReaders: Record<(typeof documentBaseFieldDefinitions)[number]['key'], (instruction: WorkInstruction) => ResourceSearchValue | ResourceSearchValue[]> = {
  title: (instruction) => instruction.title,
  categoryId: (instruction) => instruction.categoryId,
  status: (instruction) => [instruction.status, instructionStatusOptions.find((option) => option.value === instruction.status)?.label],
  version: (instruction) => instruction.version,
  material: (instruction) => instruction.material
    ? [instruction.material.code, instruction.material.name, instruction.material.spec, instruction.material.customer?.code, instruction.material.customer?.name].filter(Boolean).join(' ')
    : '',
  workCenter: (instruction) => instruction.workCenters.map((item) => `${item.code} ${item.name}`).join(' '),
  note: (instruction) => instruction.note,
  contentText: (instruction) => instruction.contentText,
  attachmentName: (instruction) => instruction.primaryAttachment?.originalName,
}

const exactOperators: readonly ResourceSearchOperator[] = ['equals']

function extensionFieldType(fieldType: DocumentFieldType): ResourceSearchFieldType {
  if (fieldType === 'NUMBER') return 'number'
  if (fieldType === 'DATE') return 'date'
  if (fieldType === 'BOOLEAN' || fieldType === 'SELECT') return 'select'
  return 'text'
}

export function extensionFieldSearchKey(fieldDefinitionId: string) {
  return `field:${fieldDefinitionId}`
}

export function buildWorkInstructionSearchCatalog(
  categoryOptions: readonly { value: string; label: string }[],
  fieldDefinitions: readonly DocumentFieldDefinitionRecord[],
) {
  const categoryLabelById = new Map(categoryOptions.map((option) => [option.value, option.label]))
  const baseFields = documentBaseFieldDefinitions.map((definition): ResourceAdvancedSearchField<WorkInstruction> => ({
    ...definition,
    read: baseFieldReaders[definition.key],
    ...(definition.key === 'categoryId' ? { options: categoryOptions }
      : definition.key === 'status' ? { options: instructionStatusOptions }
        : {}),
  }))
  const extensionFields = fieldDefinitions.map((definition): ResourceAdvancedSearchField<WorkInstruction> => {
    const type = extensionFieldType(definition.fieldType)
    const options = definition.fieldType === 'SELECT'
      ? parseFieldOptions(definition.optionsJson).map((value) => ({ value, label: value }))
      : definition.fieldType === 'BOOLEAN'
        ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
        : undefined
    return {
      key: extensionFieldSearchKey(definition.id),
      label: `${categoryLabelById.get(definition.categoryId) || '未分类'} · ${definition.name}`,
      type,
      read: (instruction) => instruction.fieldValues.find((value) => value.fieldDefinitionId === definition.id)?.valueText,
      ...(options ? { options } : {}),
      ...(definition.fieldType === 'NUMBER' || definition.fieldType === 'DATE' ? { operators: exactOperators } : {}),
    }
  })
  return defineResourceSearchCatalog<WorkInstruction>('work-instruction.actual-fields', [...baseFields, ...extensionFields])
}

export function buildWorkInstructionAdvancedSearchFields(
  categoryOptions: readonly { value: string; label: string }[],
  fieldDefinitions: readonly DocumentFieldDefinitionRecord[],
): readonly ResourceAdvancedSearchField<WorkInstruction>[] {
  return resourceAdvancedFields(buildWorkInstructionSearchCatalog(categoryOptions, fieldDefinitions))
}
