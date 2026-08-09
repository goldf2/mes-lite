import type { UnitFieldsInput } from '../contracts/unit-schema'

export interface UnitIdentity {
  code: string
  measureType: UnitFieldsInput['measureType']
}

function normalizeIdentityCode(value: string) {
  const code = value.trim()
  return /^[a-z]+$/i.test(code) ? code.toLowerCase() : code
}

export function sameUnitIdentity(left: UnitIdentity, right: UnitIdentity) {
  return left.measureType === right.measureType
    && normalizeIdentityCode(left.code) === normalizeIdentityCode(right.code)
}

export function unitIdentityExists(
  units: UnitIdentity[],
  input: UnitIdentity,
  ignored?: UnitIdentity,
) {
  return units.some((unit) => (
    sameUnitIdentity(unit, input)
    && !(ignored && sameUnitIdentity(unit, ignored))
  ))
}

export function unitSemanticsChanged(
  original: UnitIdentity,
  before: UnitFieldsInput,
  after: UnitFieldsInput,
) {
  return original.measureType !== after.measureType
    || normalizeIdentityCode(original.code) !== normalizeIdentityCode(after.code)
    || Number(before.toBaseFactor) !== Number(after.toBaseFactor)
}
