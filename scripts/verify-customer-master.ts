import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { execFileSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RequestStore } from 'next/dist/client/components/request-async-storage.external'
import type { CustomerMasterResource, MasterRecord } from '../modules/configuration/contracts/customer-master'

// All accounts, credentials, HTTP endpoints, database rows and attachments in this
// verifier are synthetic. It never reads .env files or connects to a live provider.
const originalEnv = { ...process.env }
const directory = mkdtempSync(join(tmpdir(), 'mes-contact-consumer-'))
const databaseUrl = `file:${join(directory, 'test.db')}`
const issuer = 'https://identity.synthetic.test'
const secret = 'synthetic-contact-delegation-secret-not-for-production'
const source = { appId: 'equipment-maintenance', instanceId: 'synthetic-data-platform', tenantId: 'local', workspaceId: 'default' }
const checked: string[] = []
const servers: Server[] = []
const originalGlobalAsyncStorage = (globalThis as unknown as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage
;(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage

const records: Record<CustomerMasterResource, MasterRecord[]> = {
  enterprises: [
    { id: 'enterprise-a', name: 'Shared Enterprise A', code: 'DP-A', businessUse: 'approved' },
    { id: 'enterprise-b', name: 'Shared Enterprise B', code: 'DP-B', businessUse: 'approved' },
  ].map(row => ({ ...row, revision: 3, updatedAt: '2026-10-18T01:00:00Z', sourceRef: { ...source, resource: 'enterprises', recordId: row.id }, projection: false, readOnly: true })) as MasterRecord[],
  contacts: [
    { id: 'contact-a', name: 'Alice Shared', enterpriseId: 'enterprise-a', enterpriseName: 'Shared Enterprise A', phone: '123456789', email: '', role: 'Shipping', useStatus: 'active' },
    { id: 'contact-b', name: 'Bob Other', enterpriseId: 'enterprise-b', enterpriseName: 'Shared Enterprise B', phone: '', email: '', role: '', useStatus: 'active' },
  ].map(row => ({ ...row, revision: 5, updatedAt: '2026-10-18T01:00:00Z', sourceRef: { ...source, resource: 'contacts', recordId: row.id }, projection: false, readOnly: true })) as MasterRecord[],
  locations: [
    { id: 'site-a', name: 'Shared Site A', enterpriseId: 'enterprise-a', enterpriseName: 'Shared Enterprise A', address: 'Snapshot Address', province: '', city: '', coordinate: null, useStatus: 'active' },
    { id: 'site-b', name: 'Shared Site B', enterpriseId: 'enterprise-b', enterpriseName: 'Shared Enterprise B', address: 'Other Address', province: '', city: '', coordinate: null, useStatus: 'active' },
  ].map(row => ({ ...row, revision: 7, updatedAt: '2026-10-18T01:00:00Z', sourceRef: { ...source, resource: 'locations', recordId: row.id }, projection: false, readOnly: true })) as MasterRecord[],
}
let providerStatus = 200
let providerRequests = 0
const observedSubjects = new Set<string>()

async function listen(server: Server) {
  servers.push(server)
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

function envelope(resource: CustomerMasterResource, rows = records[resource]) {
  return { schemaVersion: 'customer-master.v1', source, resource, records: rows, page: { limit: 100, offset: 0, total: rows.length, hasMore: false } }
}

async function pdfText(pdf: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise
  try {
    const text: string[] = []
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      text.push(...content.items.flatMap(item => 'str' in item ? [item.str] : []))
    }
    return text.join('').replace(/\s+/g, '')
  } finally { await document.destroy() }
}

async function main() {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl, NODE_ENV: 'test', APP_LOGIN_MODE: 'casdoor', APP_ORIGIN: 'http://127.0.0.1:31991',
    CASDOOR_ISSUER: issuer, CASDOOR_CLIENT_ID: 'synthetic-mes-client', CASDOOR_CLIENT_SECRET: 'synthetic-oidc-secret',
    CASDOOR_ORGANIZATION: 'synthetic-org', CASDOOR_APPLICATION: 'synthetic-mes',
    CUSTOMER_MASTER_ENABLED: 'true', CUSTOMER_MASTER_DELEGATION_SECRET: secret, CUSTOMER_MASTER_INSTANCE_ID: source.instanceId,
    MES_LITE_UPLOAD_DIR: join(directory, 'uploads'), MES_PUBLIC_BASE_URL: 'https://mes.synthetic.test',
  })
  for (const key of ['CASDOOR_DISCOVERY_URL', 'CASDOOR_SCOPES', 'APP_AUTH_ALLOWED_TARGETS']) delete process.env[key]
  execFileSync(join(process.cwd(), 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, RUST_LOG: 'info' }, stdio: 'pipe' })

  const providerOrigin = await listen(createServer((incoming, outgoing) => {
    try {
      providerRequests++
      const token = /^Bearer (.+)$/.exec(incoming.headers.authorization || '')?.[1] || ''
      const parts = token.split('.')
      assert.equal(parts.length, 3)
      assert.equal(parts[2], createHmac('sha256', secret).update(parts.slice(0, 2).join('.')).digest('base64url'))
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      assert.equal(claims.iss, 'mes-lite')
      assert.equal(claims.aud, 'equipment-maintenance:customer-master:v1')
      assert.equal(claims.actorIssuer, issuer)
      assert.equal(claims.instanceId, source.instanceId)
      assert.equal(claims.tenantId, 'local')
      assert.equal(claims.workspaceId, 'default')
      assert.equal(claims.method, incoming.method)
      assert.equal(claims.target, incoming.url)
      assert.ok(claims.exp > Date.now() / 1000 && claims.exp - claims.iat <= 60)
      assert.equal(claims.sub, 'synthetic-subject')
      observedSubjects.add(claims.sub)
      if (providerStatus !== 200) { outgoing.writeHead(providerStatus, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ error: 'SYNTHETIC_PROVIDER_DENIED_OR_DOWN' })); return }
      const url = new URL(incoming.url || '/', 'http://127.0.0.1')
      const match = /^\/api\/integrations\/customer-master\/v1\/(enterprises|contacts|locations)(?:\/([^/]+))?$/.exec(url.pathname)
      assert.ok(match)
      const resource = match[1] as CustomerMasterResource
      const id = match[2] && decodeURIComponent(match[2])
      let rows = records[resource].filter(row => !id || row.id === id)
      const enterpriseId = url.searchParams.get('enterpriseId')
      if (enterpriseId) rows = rows.filter(row => 'enterpriseId' in row ? row.enterpriseId === enterpriseId : row.id === enterpriseId)
      const keyword = url.searchParams.get('q')
      if (keyword) rows = rows.filter(row => row.name.includes(keyword))
      if (id && !rows.length) { outgoing.writeHead(404); outgoing.end('{}'); return }
      const total = rows.length, limit = id ? 1 : Number(url.searchParams.get('limit') || 100), offset = id ? 0 : Number(url.searchParams.get('offset') || 0)
      rows = rows.slice(offset, offset + limit)
      outgoing.writeHead(200, { 'Content-Type': 'application/json' })
      outgoing.end(JSON.stringify({ ...envelope(resource, rows), page: { limit, offset, total, hasMore: offset + rows.length < total } }))
    } catch { outgoing.writeHead(401); outgoing.end('{}') }
  }))
  process.env.CUSTOMER_MASTER_BASE_URL = providerOrigin
  process.env.CUSTOMER_MASTER_MANAGEMENT_URL = 'https://data.synthetic.test'

  const [{ prisma }, auth, runtime, authDomain, permissions, client, master, party, http, shipment, print, pricing, dataScope, storage, cookies, headers, next, cookieTypes] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'), import('../modules/identity-access/server/authentication-runtime-service'),
    import('../modules/identity-access/domain/casdoor-runtime'), import('../lib/permissions'),
    import('../modules/configuration/server/customer-master-client'), import('../modules/configuration/server/customer-master-service'),
    import('../modules/configuration/server/party-service'), import('../modules/configuration/http/customer-master-http'),
    import('../modules/sales/server/fulfillment-command-service'), import('../modules/sales/server/shipment-document-service'),
    import('../modules/sales/server/shipment-pricing-service'), import('../modules/identity-access'),
    import('next/dist/client/components/request-async-storage.external'), import('next/dist/server/web/spec-extension/adapters/request-cookies'),
    import('next/dist/server/web/spec-extension/adapters/headers'), import('next/server'), import('next/dist/server/web/spec-extension/cookies'),
  ])
  const requestStore = (token: string | undefined): RequestStore => {
    const values = new Headers(token ? { cookie: `${auth.SESSION_COOKIE}=${token}` } : {})
    return { headers: headers.HeadersAdapter.seal(values), cookies: cookies.RequestCookiesAdapter.seal(new cookieTypes.RequestCookies(values)), mutableCookies: new cookieTypes.ResponseCookies(new Headers()), draftMode: { isEnabled: false } as RequestStore['draftMode'], reactLoadableManifest: {}, assetPrefix: '' }
  }
  const as = <T>(token: string | undefined, action: () => T): T => storage.requestAsyncStorage.run(requestStore(token), action)
  const rejectsCode = async (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof client.CustomerMasterError && error.code === code)
  const mark = (name: string) => { checked.push(name) }
  try {
    const config = await runtime.ensureAuthenticationRuntime()
    assert.equal(config.ready, true)
    const operator = await prisma.operator.create({ data: { id: 'shared-contact-operator', username: 'shared-contact-operator', name: 'Synthetic Contact Reader', passwordHash: 'fixture-only', role: 'OPERATOR', status: 'ACTIVE' } })
    const administrator = await prisma.operator.create({ data: { id: 'shared-contact-recovery', username: 'shared-contact-recovery', name: 'Synthetic Recovery', passwordHash: 'fixture-only', role: 'ADMIN', status: 'ACTIVE' } })
    const binding = await prisma.operatorAuthAccount.create({ data: { provider: authDomain.casdoorProvider(issuer), providerUserId: 'synthetic-subject', operatorId: operator.id } })
    await prisma.permissionSetting.create({ data: { role: 'OPERATOR', resource: 'customers', canRead: true, canCreate: true, canUpdate: true } })
    await prisma.permissionSetting.create({ data: { role: 'OPERATOR', resource: 'shipment', canRead: true, canCreate: true } })
    let serial = 0
    const session = async (overrides: Record<string, unknown> = {}) => {
      const token = `synthetic-session-${++serial}-not-a-production-cookie`
      const data = { tokenHash: createHash('sha256').update(token).digest('hex'), operatorId: operator.id, expiresAt: new Date(Date.now() + 60_000), authSource: 'casdoor', authAccountId: binding.id, authSubject: 'synthetic-subject', authGeneration: config.state.generation, ...overrides }
      await prisma.operatorSession.create({ data })
      return token
    }
    const good = await session()
    await rejectsCode(as(undefined, () => client.requireCustomerMasterActor()), 'CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED')
    assert.deepEqual(await as(good, () => client.requireCustomerMasterActor()), { issuer, subject: 'synthetic-subject' })
    for (const overrides of [
      { authSource: 'native' },
      { authSource: 'native-admin-recovery', operatorId: administrator.id },
      { expiresAt: new Date(0) },
      { authSubject: 'forged-subject' },
      { authGeneration: 'old-generation' },
      { authAccountId: 'missing-binding' },
    ]) await rejectsCode(as(await session(overrides), () => client.requireCustomerMasterActor()), 'CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED')
    const disabledSession = await session()
    await prisma.operator.update({ where: { id: operator.id }, data: { status: 'DISABLED' } })
    await rejectsCode(as(disabledSession, () => client.requireCustomerMasterActor()), 'CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED')
    await prisma.operator.update({ where: { id: operator.id }, data: { status: 'ACTIVE' } })
    const revokedSession = await session()
    await prisma.operatorAuthAccount.update({ where: { id: binding.id }, data: { providerUserId: 'changed-binding' } })
    await rejectsCode(as(revokedSession, () => client.requireCustomerMasterActor()), 'CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED')
    await prisma.operatorAuthAccount.update({ where: { id: binding.id }, data: { providerUserId: 'synthetic-subject' } })
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: false } })
    await rejectsCode(as(good, () => client.requireCustomerMasterActor()), 'CUSTOMER_MASTER_FORBIDDEN')
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: true } })
    assert.equal((await permissions.getEffectivePermissionMap(operator, { initializeDefaults: false })).customers.canRead, true)
    mark('live-session-binding-status-generation-and-local-permission')

    const contact = await as(good, () => client.fetchCustomerMaster('contacts', new URLSearchParams(), 'contact-a'))
    assert.equal(contact.records[0].name, 'Alice Shared')
    assert.match(contact.managementHref!, /^https:\/\/data\.synthetic\.test\//)
    assert.deepEqual(Array.from(observedSubjects), ['synthetic-subject'])
    const actor = { issuer, subject: 'synthetic-subject' }
    for (const mutate of [
      (value: ReturnType<typeof envelope>) => { value.source = { ...source, workspaceId: 'foreign' } },
      (value: ReturnType<typeof envelope>) => { value.records = value.records.map(row => ({ ...row, sourceRef: { ...row.sourceRef, recordId: 'wrong' } })) },
      (value: ReturnType<typeof envelope>) => { value.records = [{ ...value.records[0], useStatus: 'inactive' } as unknown as MasterRecord] },
    ]) {
      const value = structuredClone(envelope('contacts'))
      mutate(value)
      await assert.rejects(client.requestCustomerMaster(actor, 'contacts', new URLSearchParams(), undefined, async () => Response.json(value)))
    }
    await rejectsCode(client.requestCustomerMaster(actor, 'contacts', new URLSearchParams({ enterpriseId: 'enterprise-a' }), undefined, async () => Response.json(envelope('contacts'))), 'CUSTOMER_MASTER_RELATION_MISMATCH')
    await rejectsCode(client.requestCustomerMaster(actor, 'contacts', new URLSearchParams(), undefined, async () => new Response('x'.repeat(1048577))), 'CUSTOMER_MASTER_RESPONSE_TOO_LARGE')
    for (const status of [401, 403]) await rejectsCode(client.requestCustomerMaster(actor, 'contacts', new URLSearchParams(), undefined, async () => new Response('{}', { status })), 'CUSTOMER_MASTER_FORBIDDEN')
    await rejectsCode(client.requestCustomerMaster(actor, 'contacts', new URLSearchParams(), undefined, async () => new Response('', { status: 302, headers: { Location: 'https://untrusted.synthetic.test' } })), 'CUSTOMER_MASTER_UNAVAILABLE')
    assert.throws(() => client.customerMasterConfiguration({ ...process.env, NODE_ENV: 'production', CUSTOMER_MASTER_BASE_URL: providerOrigin }), /CUSTOMER_MASTER_UNAVAILABLE/)
    mark('signed-loopback-transport-exact-source-relations-size-and-denials')

    const legacy = await prisma.customer.create({ data: { id: 'legacy-customer-a', code: 'MES-A', name: 'Legacy label', contact: 'Legacy Contact', phone: 'legacy-phone', address: 'legacy-address' } })
    const unlinked = await prisma.customer.create({ data: { id: 'legacy-customer-b', code: 'MES-B', name: 'Unlinked label', contact: 'Unlinked Contact', phone: 'unlinked-phone' } })
    const legacyBefore = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } })
    await rejectsCode(party.createManagedParty('customer', { name: 'Forbidden Local', contact: 'Duplicate' }), 'CUSTOMER_MAINTAINED_IN_DATA_PLATFORM')
    await rejectsCode(party.updateManagedParty('customer', unlinked.id, { name: unlinked.name, contact: 'Duplicate' }), 'CUSTOMER_MAINTAINED_IN_DATA_PLATFORM')
    const supplier = await party.createManagedParty('supplier', { name: 'Independent Supplier', contact: 'Supplier Contact', phone: '123' })
    assert.equal(supplier.contact, 'Supplier Contact')
    const supplierUpdate = await party.updateManagedParty('supplier', supplier.id, { name: supplier.name, contact: 'New Supplier Contact' })
    assert.equal(supplierUpdate.updated.contact, 'New Supplier Contact')
    await rejectsCode(as(good, () => master.linkCustomerMaster({ customerId: legacy.id, enterpriseId: 'enterprise-a', expectedRevision: 2 })), 'CUSTOMER_MASTER_REVISION_CONFLICT')
    const linked = await as(good, () => master.linkCustomerMaster({ customerId: legacy.id, enterpriseId: 'enterprise-a', expectedRevision: 3 }))
    assert.equal(linked.customerId, legacy.id)
    assert.deepEqual(await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } }), legacyBefore)
    assert.equal((await as(good, () => master.linkCustomerMaster({ customerId: legacy.id, enterpriseId: 'enterprise-a', expectedRevision: 3 }))).linkCreated, false)
    await rejectsCode(as(good, () => master.linkCustomerMaster({ customerId: unlinked.id, enterpriseId: 'enterprise-a', expectedRevision: 3 })), 'CUSTOMER_MASTER_ALREADY_LINKED')
    await rejectsCode(party.updateManagedParty('customer', legacy.id, { name: 'Changed', contact: 'Changed' }), 'CUSTOMER_MAINTAINED_IN_DATA_PLATFORM')
    mark('single-contact-owner-supplier-compatible-explicit-idempotent-link')

    const selection = { customerMasterRevision: 3, customerMasterContactId: 'contact-a', customerMasterContactRevision: 5, customerMasterLocationId: 'site-a', customerMasterLocationRevision: 7 }
    const snapshot = await as(good, () => master.captureCustomerMasterSnapshot(legacy.id, selection))
    assert.ok(snapshot)
    assert.equal(snapshot.contact, 'Alice Shared')
    assert.equal(snapshot.address, 'Snapshot Address')
    const blank = await as(good, () => master.captureCustomerMasterSnapshot(legacy.id, { customerMasterRevision: 3 }))
    assert.ok(blank)
    assert.deepEqual([blank.contact, blank.phone, blank.address, blank.contactId, blank.locationId], ['', '', '', null, null])
    for (const override of [{ customerMasterRevision: 2 }, { customerMasterContactRevision: 4 }, { customerMasterLocationRevision: 6 }]) await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(legacy.id, { ...selection, ...override })), 'CUSTOMER_MASTER_REVISION_CONFLICT')
    await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(legacy.id, { ...selection, customerMasterContactId: 'contact-b' })), 'CUSTOMER_MASTER_RELATION_MISMATCH')
    await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(legacy.id, { ...selection, customerMasterLocationId: 'site-b' })), 'CUSTOMER_MASTER_RELATION_MISMATCH')
    await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(unlinked.id, selection)), 'CUSTOMER_MASTER_LINK_REQUIRED')
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: false } })
    await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(legacy.id)), 'CUSTOMER_MASTER_FORBIDDEN')
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: true } })
    mark('chosen-record-versions-relations-and-no-default-contact-permission-bypass')

    const material = await prisma.material.create({ data: { code: 'CONTACT-TEST-MAT', name: 'Test Material', unit: '件', stockUnit: '件' } })
    const warehouse = await prisma.inventoryLocation.create({ data: { code: 'CONTACT-TEST-WH', name: 'Synthetic Warehouse' } })
    const createInput = { customerId: legacy.id, ...selection, items: [{ materialId: material.id, locationId: warehouse.id, qty: 1, unitPrice: 10 }] }
    const saved = await as(good, () => shipment.createManagedShipment(createInput))
    assert.equal(saved.customerId, legacy.id)
    assert.equal(JSON.parse(saved.customerMasterSnapshot!).contactRevision, 5)
    const savedSnapshot = saved.customerMasterSnapshot
    const savedBlank = await as(good, () => shipment.createManagedShipment({ customerId: legacy.id, customerMasterRevision: 3, items: [{ materialId: material.id, locationId: warehouse.id, qty: 1, unitPrice: 10 }] }))
    const settings = await import('../lib/system-settings')
    await settings.updateSystemSettings({ companyName: 'Synthetic MES Company', companyContact: 'Synthetic Sender' })
    const orderService = await import('../modules/sales/server/sales-order-command-service')
    const orderPrint = await import('../modules/business-documents/server/business-document-print-query-service')
    const order = await as(good, () => orderService.createManagedSalesOrder({ ...createInput, orderDate: '2026-10-18' }))
    const blankOrder = await as(good, () => orderService.createManagedSalesOrder({ customerId: legacy.id, customerMasterRevision: 3, orderDate: '2026-10-18', items: [{ materialId: material.id, qty: 1, unitPrice: 10 }] }))
    const historicalOrder = await prisma.salesOrder.create({ data: { orderNo: 'LEGACY-CONTACT-ORDER', customerId: unlinked.id, orderDate: new Date('2026-10-17T00:00:00Z') } })
    assert.equal(historicalOrder.customerMasterSnapshot, null)
    const firstOrderPrint = await orderPrint.loadBusinessDocumentPrintData('sales-order', order.id)
    const firstBlankOrderPrint = await orderPrint.loadBusinessDocumentPrintData('sales-order', blankOrder.id)
    assert.equal(firstOrderPrint?.summaryFields?.find(field => field.label === '联系人')?.value, 'Alice Shared')
    assert.equal(firstBlankOrderPrint?.summaryFields?.find(field => field.label === '联系人')?.value, '-')
    assert.equal((await orderPrint.loadBusinessDocumentPrintData('sales-order', historicalOrder.id))?.summaryFields?.find(field => field.label === '联系人')?.value, 'Unlinked Contact')
    // This fixture advances only document state; stock posting is covered by the
    // existing fulfillment suite, not simulated through a production warehouse.
    await prisma.shipment.updateMany({ where: { id: { in: [saved.id, savedBlank.id] } }, data: { status: 'SHIPPED', shippedAt: new Date('2026-10-18T01:00:00Z') } })
    // Explicit bad legacy values prove blanks cannot fall through to live labels.
    await prisma.shipment.update({ where: { id: savedBlank.id }, data: { customerPhone: 'bad-live-phone', address: 'bad-live-address' } })
    const beforePdf = await print.resolveShipmentDocumentPdf(saved.id, { audience: 'customer' })
    const blankPdf = await print.resolveShipmentDocumentPdf(savedBlank.id, { audience: 'customer' })
    const content = await pdfText(beforePdf.pdf)
    assert.ok(content.includes('AliceShared') && content.includes('SnapshotAddress'))
    const blankContent = await pdfText(blankPdf.pdf)
    for (const forbidden of ['LegacyContact', 'legacy-phone', 'legacy-address', 'bad-live-phone', 'bad-live-address']) assert.equal(blankContent.includes(forbidden), false)
    records.contacts[0].name = 'Changed Provider Contact'
    records.contacts[0].revision++
    await prisma.customer.update({ where: { id: legacy.id }, data: { contact: 'Changed Legacy Contact', phone: 'changed-legacy-phone', address: 'changed-legacy-address' } })
    providerStatus = 503
    const requestsBeforePrint = providerRequests
    assert.ok((await print.resolveShipmentDocumentPdf(saved.id, { audience: 'customer' })).pdf.equals(beforePdf.pdf))
    assert.ok((await print.resolveShipmentDocumentPdf(savedBlank.id, { audience: 'customer' })).pdf.equals(blankPdf.pdf))
    assert.deepEqual(await orderPrint.loadBusinessDocumentPrintData('sales-order', order.id), firstOrderPrint)
    assert.deepEqual(await orderPrint.loadBusinessDocumentPrintData('sales-order', blankOrder.id), firstBlankOrderPrint)
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: historicalOrder.id } })).customerMasterSnapshot, null)
    assert.equal(providerRequests, requestsBeforePrint, 'historical printing never calls current contact provider')
    const currentShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: saved.id } })
    const priced = await pricing.updateShipmentPrices(saved.id, { updatedAt: currentShipment.updatedAt.toISOString(), reason: 'Synthetic price correction', items: saved.items.map(item => ({ id: item.id, unitPrice: 12 })) }, dataScope.unrestrictedDataScope, { operatorId: operator.id, operatorName: operator.name })
    assert.equal(priced.totalAmount, 12)
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: saved.id } })).customerMasterSnapshot, savedSnapshot)
    const repricedText = await pdfText((await print.resolveShipmentDocumentPdf(saved.id, { audience: 'customer' })).pdf)
    assert.ok(repricedText.includes('AliceShared'))
    assert.equal(repricedText.includes('ChangedProviderContact'), false)
    assert.equal(repricedText.includes('ChangedLegacyContact'), false)
    const list = await as(good, () => master.customerMasterViews([legacyBefore], true))
    assert.equal(list[0].master?.status, 'unavailable')
    assert.equal(JSON.stringify(list).includes('legacy-phone'), false)
    assert.equal(JSON.stringify(list).includes('Legacy Contact'), false)
    await rejectsCode(as(good, () => master.captureCustomerMasterSnapshot(legacy.id, selection)), 'CUSTOMER_MASTER_UNAVAILABLE')
    providerStatus = 200
    mark('real-shipment-and-sales-order-snapshots-print-blanks-price-edit-provider-outage')

    const shipmentRoute = await import('../app/api/shipments/route')
    const httpOrigin = await listen(createServer(async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url || '/', 'http://127.0.0.1')
        const chunks: Buffer[] = []
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks).toString('utf8')
        const requestHeaders = new Headers(Object.entries(incoming.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : value] as [string, string]]))
        const token = /(?:^|;\s*)mes_lite_session=([^;]+)/.exec(incoming.headers.cookie || '')?.[1]
        const request = new next.NextRequest(url, { method: incoming.method, headers: requestHeaders, ...(body ? { body } : {}) })
        const response = await as(token, () => url.pathname === '/api/shipments' ? shipmentRoute.POST(request) : http.customerMasterGet(request, 'contacts'))
        outgoing.writeHead(response.status, Object.fromEntries(response.headers))
        outgoing.end(Buffer.from(await response.arrayBuffer()))
      } catch { outgoing.writeHead(500); outgoing.end('{}') }
    }))
    const call = (path: string, token?: string, body?: unknown) => fetch(httpOrigin + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Cookie: `${auth.SESSION_COOKIE}=${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    assert.equal((await call('/api/customer-master/contacts')).status, 403)
    const allowed = await call('/api/customer-master/contacts?enterpriseId=enterprise-a', good)
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('cache-control'), 'no-store')
    assert.equal((await allowed.json()).records[0].name, 'Changed Provider Contact')
    for (const query of ['?actor=admin', '?workspaceId=foreign', '?q=a&q=b', '?limit=101']) assert.equal((await call('/api/customer-master/contacts' + query, good)).status, 400)
    assert.equal((await call('/api/customer-master/contacts', await session({ authSource: 'native-admin-recovery', operatorId: administrator.id }))).status, 403)
    providerStatus = 403
    assert.equal((await call('/api/customer-master/contacts', good)).status, 403)
    providerStatus = 200
    const beforeShipmentCount = await prisma.shipment.count()
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: false } })
    assert.equal((await call('/api/shipments', good, { customerId: legacy.id, items: [{ materialId: material.id, locationId: warehouse.id, qty: 1 }] })).status, 403, 'omitting IDs still cannot bypass contact authorization')
    assert.equal(await prisma.shipment.count(), beforeShipmentCount)
    assert.equal((await call('/api/customer-master/contacts', good)).status, 403)
    mark('loopback-http-handlers-real-cookies-permission-denial-and-no-write-on-error')
    console.log(`Customer master verification passed (${checked.length} groups):\n${checked.map(name => `- ${name}`).join('\n')}`)
  } finally { await prisma.$disconnect() }
}

main().finally(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })))
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  if (originalGlobalAsyncStorage) (globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = originalGlobalAsyncStorage
  else delete (globalThis as unknown as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage
  rmSync(directory, { recursive: true, force: true })
}).catch(error => { console.error(error); process.exitCode = 1 })
