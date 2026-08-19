import { createPublicKey, verify, type KeyObject } from 'crypto'
import { AttachmentDomainError } from '../domain/attachment-errors'
import { loadWopiDiscovery, type WopiDiscovery } from './wopi-discovery-service'

const dotNetEpochTicks = BigInt('621355968000000000')
const ticksPerMillisecond = BigInt(10000)
const maxTimestampAgeMs = 20 * 60 * 1000

function base64Url(value: string) {
  return Buffer.from(value, 'base64').toString('base64url')
}

function publicKey(input: { modulus: string; exponent: string }): KeyObject {
  return createPublicKey({
    key: {
      kty: 'RSA',
      n: base64Url(input.modulus),
      e: base64Url(input.exponent),
    },
    format: 'jwk',
  })
}

export function buildWopiProofExpectedValue(accessToken: string, requestUrl: string, timestamp: bigint) {
  const token = Buffer.from(accessToken, 'utf8')
  const url = Buffer.from(requestUrl.toUpperCase(), 'utf8')
  const tokenLength = Buffer.alloc(4)
  const urlLength = Buffer.alloc(4)
  const timestampLength = Buffer.alloc(4)
  const timestampValue = Buffer.alloc(8)
  tokenLength.writeUInt32BE(token.length)
  urlLength.writeUInt32BE(url.length)
  timestampLength.writeUInt32BE(timestampValue.length)
  timestampValue.writeBigInt64BE(timestamp)
  return Buffer.concat([tokenLength, token, urlLength, url, timestampLength, timestampValue])
}

function timestampIsFresh(timestamp: bigint) {
  const milliseconds = Number((timestamp - dotNetEpochTicks) / ticksPerMillisecond)
  return Number.isFinite(milliseconds) && Math.abs(Date.now() - milliseconds) <= maxTimestampAgeMs
}

function signatureMatches(expected: Buffer, signature: string | null, key: KeyObject) {
  if (!signature) return false
  try {
    return verify('RSA-SHA256', expected, key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

export async function verifyWopiProof(
  request: Request,
  accessToken: string,
  requestUrl: string,
  discovery?: WopiDiscovery,
) {
  const timestampValue = request.headers.get('x-wopi-timestamp')
  const proof = request.headers.get('x-wopi-proof')
  const oldProof = request.headers.get('x-wopi-proofold')
  if (!timestampValue || !/^\d+$/.test(timestampValue) || !proof) {
    throw new AttachmentDomainError('WOPI 请求签名缺失', 500)
  }

  const timestamp = BigInt(timestampValue)
  if (!timestampIsFresh(timestamp)) {
    throw new AttachmentDomainError('WOPI 请求签名已过期', 500)
  }

  const keys = discovery || await loadWopiDiscovery()
  const expected = buildWopiProofExpectedValue(accessToken, requestUrl, timestamp)
  const current = publicKey(keys.currentProofKey)
  const old = publicKey(keys.oldProofKey)
  if (
    signatureMatches(expected, proof, current)
    || signatureMatches(expected, oldProof, current)
    || signatureMatches(expected, proof, old)
  ) return

  throw new AttachmentDomainError('WOPI 请求签名无效', 500)
}
