import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadTaskUiPlaywright, startTaskUiHarness, type TaskUiHarness } from './task-collaboration-ui-fixture'

// Playwright is loaded from an already-installed local cache, never npm install/npx.
// These structural handles keep that optional local browser dependency out of the project dependency graph.
type Page = any
type Locator = any
type Context = any
type ApiResponse = any
type UiTask = { id: string; taskNo: string; title: string; revision: number; [key: string]: any }
const taskPath = '/api/task-collaboration'
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]
const results: Array<Record<string, unknown>> = []
const pageErrors: string[] = []
const consoleErrors: string[] = []
const blockedOrigins = new Set<string>()
let harness: TaskUiHarness | null = null
let browser: any = null
let currentPage: Page | null = null
let harnessStarting: Promise<TaskUiHarness> | null = null
let browserStarting: Promise<any> | null = null
let cleanupPromise: Promise<void> | null = null
let stopping = false

function cleanupAll() {
  if (!cleanupPromise) cleanupPromise = (async () => {
    const activeBrowser = browser || await browserStarting?.catch(() => null)
    try { await activeBrowser?.close() } finally {
      const activeHarness = harness || await harnessStarting?.catch(() => null)
      await activeHarness?.cleanup()
    }
  })()
  return cleanupPromise
}

async function localContext(viewport: { width: number; height: number }, acceptDownloads = false) {
  // Fresh contexts have no service workers. Playwright's block option injects a navigator.serviceWorker getter into sandboxed TXT iframes and raises its own SecurityError.
  const context = await browser.newContext({ viewport, acceptDownloads, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
  await context.route('**/*', (route: any) => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== harness!.baseUrl) {
      blockedOrigins.add(url.origin)
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  return context
}

function monitor(page: Page) {
  page.on('pageerror', (error: Error) => pageErrors.push(error.message))
  page.on('console', (message: any) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const url = message.location().url || ''
    // An unauthenticated login screen and the explicit stale-edit test intentionally receive these HTTP statuses.
    const expectedLogin401 = /\b401\b/.test(text) && url.includes('/api/auth/me')
    const expectedConflict409 = /\b409\b/.test(text) && url.includes(taskPath)
    if (/Failed to load resource/.test(text) && (expectedLogin401 || expectedConflict409)) return
    consoleErrors.push(`${text} (${url})`)
  })
}

async function visible(locator: Locator, label: string) {
  await locator.waitFor({ state: 'visible' })
  assert.equal(await locator.isVisible(), true, label)
}

async function enabledState(page: Page, locator: Locator, enabled: boolean, label: string) {
  await visible(locator, label)
  const element = await locator.elementHandle()
  await page.waitForFunction(({ button, expected }: { button: HTMLButtonElement; expected: boolean }) => !button.disabled === expected,
    { button: element, expected: enabled })
  assert.equal(await locator.isEnabled(), enabled, label)
}

async function noOverflow(page: Page, stage: string) {
  const size = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(size.document <= size.viewport + 1, `${stage} 页面横向溢出：${JSON.stringify(size)}`)
}

async function screenshot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: join(harness!.artifacts, name), fullPage })
}

async function responseData(response: ApiResponse, expectedStatus: number) {
  assert.match(response.headers()['content-type'] || '', /application\/json/i,
    `真实本地 API ${new URL(response.url()).pathname} 返回非JSON，HTTP ${response.status()}`)
  const body = await response.json()
  assert.equal(response.status(), expectedStatus, `真实本地 API 返回 ${response.status()}：${JSON.stringify(body)}`)
  return expectedStatus >= 400 ? body : body.data
}

async function act(page: Page, path: string, method: string, expectedStatus: number, action: () => Promise<unknown>) {
  const [response] = await Promise.all([
    page.waitForResponse((response: any) => new URL(response.url()).pathname === path && response.request().method() === method),
    action(),
  ])
  return responseData(response, expectedStatus)
}

function detail(page: Page): Locator { return page.getByRole('complementary', { name: '资源详情' }) }
function dialog(page: Page, name: RegExp): Locator { return page.getByRole('dialog', { name }) }

async function openNew(page: Page) {
  await openMobileTools(page)
  const create = page.getByRole('button', { name: '新建', exact: true }).first()
  await create.click()
}

async function openMobileTools(page: Page) {
  if (page.viewportSize().width < 1024) {
    const tools = page.getByRole('button', { name: '页面工具', exact: true })
    await visible(tools, '移动页面工具入口已装配')
    const panel = dialog(page, /^页面工具$/)
    if (await tools.getAttribute('aria-expanded') !== 'true') {
      // Escape closes the shell's tools panel with a transition; wait for it to finish before reopening.
      await panel.waitFor({ state: 'hidden' })
      await tools.click()
    }
    await visible(panel, '移动页面工具面板')
  }
}

async function openPageAction(page: Page, name: string) {
  await openMobileTools(page)
  await page.getByRole('button', { name, exact: true }).click()
}

async function choose(page: Page, placeholder: string, text: string, retainSelection = true) {
  const input = page.getByRole('combobox', { name: placeholder, exact: true })
  await input.fill(text)
  await visible(page.getByRole('option', { name: new RegExp(text) }).first(), `选项 ${text}`)
  await input.press('ArrowDown')
  await input.press('Enter')
  if (retainSelection) assert.ok((await input.inputValue()).includes(text), `键盘选择应保留 ${text}`)
}

async function openTask(page: Page, task: UiTask) {
  const closeTools = page.getByRole('button', { name: '关闭页面工具', exact: true })
  if (await closeTools.isVisible()) {
    await closeTools.click()
    await dialog(page, /^页面工具$/).waitFor({ state: 'hidden' })
  }
  const taskPage = page.locator('[data-page-key="taskCollaboration"]')
  await visible(taskPage.getByRole('heading', { name: '任务协同', exact: true }), '真实任务页面已装配')
  await page.getByText('正在加载任务协同数据…', { exact: true }).waitFor({ state: 'hidden' })
  const row = page.getByLabel(`查看协同任务 ${task.taskNo} ${task.title}`, { exact: true })
  if (!await row.isVisible()) {
    const trigger = page.getByRole('button', { name: '呼出任务协同列表', exact: true })
    if (await trigger.isVisible()) await trigger.click()
  }
  await visible(row, '任务记录必须可见')
  const alreadySelected = await row.getAttribute('aria-selected') === 'true'
    || await row.getAttribute('aria-current') === 'true'
  const listDialog = dialog(page, /^任务协同列表弹窗$/)
  const listWasOpen = await listDialog.isVisible()
  await row.focus()
  await row.press('Enter')
  await visible(detail(page), 'Enter 打开任务详情')
  await visible(detail(page).getByRole('heading', { name: task.title, exact: true }), '详情显示已选任务')
  const minimizeList = page.getByRole('button', { name: '最小化任务协同列表', exact: true })
  // Selecting a different record closes the shared overlay automatically. Only
  // reselecting its current record needs the explicit minimize action.
  if (listWasOpen && alreadySelected) {
    await minimizeList.click()
  }
  await listDialog.waitFor({ state: 'hidden' })
}

async function loginThroughUi(page: Page) {
  await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
  await page.locator('#login-username').fill(harness!.actors.author.username)
  await page.locator('#login-password').fill(harness!.password)
  await act(page, '/api/auth/login', 'POST', 200, () => page.locator('form').getByRole('button', { name: '登录', exact: true }).click())
  await visible(page.locator('[data-page-key="taskCollaboration"]'), '登录后接入真实任务页面')
}

async function loginContext(context: Context, username: string) {
  await responseData(await context.request.post(`${harness!.baseUrl}/api/auth/login`, {
    headers: { Origin: harness!.baseUrl }, data: { username, password: harness!.password },
  }), 200)
}

async function exerciseFlow(viewport: { width: number; height: number }) {
  const context = await localContext(viewport, true)
  const page = await context.newPage()
  currentPage = page
  monitor(page)
  const prefix = String(viewport.width)
  let trackArchivedFileRequests = false
  const archivedFileRequests: string[] = []
  page.on('request', (request: any) => {
    const path = new URL(request.url()).pathname
    if (trackArchivedFileRequests && /^\/api\/attachments\/[^/]+\/(file|preview|thumbnail|image)(?:\/|$)/.test(path)) archivedFileRequests.push(path)
  })
  let releaseList!: () => void
  const listGate = new Promise<void>(resolve => { releaseList = resolve })
  const initialListRoute = async (route: any) => {
    // React's development effect can cancel and repeat the initial GET; hold every initial list attempt.
    if (route.request().method() === 'GET') await listGate
    await route.continue()
  }
  const listMatcher = (url: URL) => url.pathname === taskPath
  await page.route(listMatcher, initialListRoute)
  try {
    await loginThroughUi(page)
    const mobileList = page.getByRole('button', { name: '呼出任务协同列表', exact: true })
    if (viewport.width === 390 && await mobileList.isVisible()) await mobileList.click()
    await visible(page.getByText('正在加载任务协同数据…', { exact: true }), '真实列表未返回时显示加载状态')
    const initialListResponse = page.waitForResponse((response: any) => new URL(response.url()).pathname === taskPath && response.status() === 200)
    releaseList()
    await initialListResponse
    await page.unroute(listMatcher, initialListRoute)
    if (viewport.width === 1440) await visible(page.getByText('尚未创建协同任务', { exact: true }), '合成空数据库显示空状态')
    await noOverflow(page, `${prefix} 列表`)

    await openNew(page)
    let draftDialog = dialog(page, /新建协同任务草稿/)
    await visible(draftDialog, '新建弹窗')
    await page.keyboard.press('Tab')
    assert.equal(await draftDialog.evaluate((element: HTMLElement) => element.contains(document.activeElement)), true, 'Tab 焦点留在当前新建任务弹窗中')
    await page.keyboard.press('Escape')
    await draftDialog.waitFor({ state: 'hidden' })
    if (viewport.width === 390) await dialog(page, /^页面工具$/).waitFor({ state: 'hidden' })
    await openNew(page)
    draftDialog = dialog(page, /新建协同任务草稿/)
    const title = `UI-${prefix} 合成协同闭环`
    const localDueAt = viewport.width === 1440 ? '2026-11-03T09:15' : '2026-11-04T16:20'
    const expectedDueAt = viewport.width === 1440 ? '2026-11-03T01:15:00.000Z' : '2026-11-04T08:20:00.000Z'
    await draftDialog.getByLabel(/^任务标题/).fill(title)
    await draftDialog.getByLabel(/^计划数量/).fill('10')
    await draftDialog.getByLabel(/^单位/).fill('件')
    await draftDialog.getByLabel(/^要求交期/).fill(localDueAt)
    await choose(page, '输入员工工号、姓名或部门筛选', harness!.fixture.employee.name)
    await choose(page, '选择所属工作中心', harness!.fixture.workCenter.name)
    await draftDialog.getByPlaceholder('填写本任务特殊公差、表面处理、包装防护、检验抽样或外协交付要求…').fill('合成界面要求：按冻结资料领用，不产生库存过账。')
    await choose(page, '搜索物料编码、名称或规格，选择后立即加入任务 BOM 明细', harness!.fixture.material.name, false)
    await draftDialog.getByRole('spinbutton', { name: new RegExp(`${harness!.fixture.material.name}数量$`) }).fill('2')
    await draftDialog.getByRole('combobox', { name: new RegExp(`${harness!.fixture.material.name}单位$`) }).selectOption('件')
    await draftDialog.getByPlaceholder('行加工说明，如：热处理 HRC48-52').fill('合成公差说明')
    await noOverflow(page, `${prefix} 草稿表单`)
    await screenshot(page, `${prefix}-draft.png`)
    let task: UiTask = await act(page, taskPath, 'POST', 201, () => draftDialog.getByRole('button', { name: '保存任务草稿', exact: true }).click())
    assert.equal(task.title, title)
    assert.equal(task.lines[0].materialId, harness!.fixture.material.id)
    assert.equal(task.lines[0].quantity, 2)
    assert.equal(task.dueAt, expectedDueAt, 'Asia/Shanghai 交期输入必须按正确偏移保存为 ISO')
    await draftDialog.waitFor({ state: 'hidden' })
    await visible(detail(page), '新任务详情')

    const fileName = `synthetic-ui-drawing-${prefix}.txt`
    const attachment = await act(page, '/api/attachments', 'POST', 201, () => detail(page).locator('input[type="file"]').first().setInputFiles({
      name: fileName, mimeType: 'text/plain', buffer: harness!.fixture.drawing,
    }))
    await visible(detail(page).getByText(fileName, { exact: true }).first(), '真实附件上传回读')
    const documentRefs = [{ attachmentId: attachment.id, name: fileName, versionLabel: 'Rev.UI-A', hash: harness!.fixture.drawingHash }]
    if (viewport.width === 1440) {
      const secondName = 'synthetic-ui-second-drawing.txt'
      const secondBytes = Buffer.concat([harness!.fixture.drawing, Buffer.from('SECOND INDEPENDENT DRAWING\n')])
      const second = await act(page, '/api/attachments', 'POST', 201, () => detail(page).locator('input[type="file"]').first().setInputFiles({
        name: secondName, mimeType: 'text/plain', buffer: secondBytes,
      }))
      await visible(detail(page).getByText(secondName, { exact: true }).first(), '第二份图纸真实上传')
      documentRefs.push({ attachmentId: second.id, name: secondName, versionLabel: 'Rev.UI-B', hash: createHash('sha256').update(secondBytes).digest('hex') })
    }
    await detail(page).getByRole('button', { name: '编辑信息', exact: true }).click()
    const editDialog = dialog(page, /编辑协同任务/)
    await visible(editDialog, '编辑弹窗')
    assert.equal(await editDialog.getByLabel(/^任务标题/).inputValue(), title, '新建后编辑必须重新载入当前任务，不能沿用旧弹窗 state')
    assert.equal(await editDialog.getByLabel(/^要求交期/).inputValue(), localDueAt, 'ISO 交期重开编辑必须还原为相同中国本地时间')
    const lineAdder = editDialog.getByRole('combobox', { name: '选择要追加到本 BOM 行的图纸或技术附件', exact: true }).locator('..').locator('..')
    for (const ref of documentRefs) {
      await choose(page, '选择要追加到本 BOM 行的图纸或技术附件', ref.name)
      await lineAdder.getByPlaceholder('业务版本（选填）', { exact: true }).fill(ref.versionLabel)
      await lineAdder.getByRole('button', { name: '添加行图纸', exact: true }).click()
    }
    task = await act(page, `${taskPath}/${task.id}`, 'PATCH', 200, () => editDialog.getByRole('button', { name: '保存修改', exact: true }).click())
    assert.equal(task.lines[0].documentRefs[0].attachmentId, attachment.id)
    assert.deepEqual(task.lines[0].documentRefs.map((ref: any) => ({ attachmentId: ref.attachmentId, versionLabel: ref.versionLabel })),
      documentRefs.map(({ attachmentId, versionLabel }) => ({ attachmentId, versionLabel })), '同一BOM行多图纸与版本保存不得丢失')
    assert.equal(task.dueAt, expectedDueAt, '未修改的本地交期再次保存不能漂移8小时')
    await editDialog.waitFor({ state: 'hidden' })
    await detail(page).getByRole('button', { name: '编辑信息', exact: true }).click()
    const reopened = dialog(page, /编辑协同任务/)
    await visible(reopened, '重新编辑多图纸BOM')
    assert.deepEqual(await reopened.getByPlaceholder('业务版本（选填，不填则留空）', { exact: true }).evaluateAll((inputs: HTMLInputElement[]) => inputs.map(input => input.value)),
      documentRefs.map(ref => ref.versionLabel), '再次打开编辑保留所有BOM图纸版本')
    await page.keyboard.press('Escape')
    await reopened.waitFor({ state: 'hidden' })

    await detail(page).getByRole('button', { name: '派工确认', exact: true }).click()
    const assignDialog = dialog(page, /^派工确认 ·/)
    task = await act(page, `${taskPath}/${task.id}/assign`, 'POST', 200, () => assignDialog.getByRole('button', { name: '确认派工', exact: true }).click())
    assert.equal(task.status, 'ASSIGNED')
    await assignDialog.waitFor({ state: 'hidden' })

    await detail(page).getByRole('button', { name: '登记进度 / 异常', exact: true }).click()
    let progressDialog = dialog(page, /^登记任务进度 \/ 异常/)
    await progressDialog.getByLabel(/^进度说明/).fill(`合成 ${prefix} 工序已开始`)
    await progressDialog.getByLabel(/^同步变更任务状态/).selectOption('IN_PROGRESS')
    task = await act(page, `${taskPath}/${task.id}/progress`, 'POST', 201, () => progressDialog.getByRole('button', { name: '提交记录', exact: true }).click())
    assert.equal(task.status, 'IN_PROGRESS')
    await progressDialog.waitFor({ state: 'hidden' })
    await detail(page).getByRole('button', { name: '登记进度 / 异常', exact: true }).click()
    progressDialog = dialog(page, /^登记任务进度 \/ 异常/)
    await progressDialog.getByRole('button', { name: '异常上报', exact: true }).click()
    await progressDialog.getByLabel(/^异常情况与现场处理说明/).fill(`合成 ${prefix} 异常已确认，仅作协同记录`)
    task = await act(page, `${taskPath}/${task.id}/progress`, 'POST', 201, () => progressDialog.getByRole('button', { name: '提交记录', exact: true }).click())
    await progressDialog.waitFor({ state: 'hidden' })
    assert.equal(task.progress.length, 2)

    await detail(page).getByRole('button', { name: '发布资料清单', exact: true }).click()
    const releaseDialog = dialog(page, /^发布任务资料包/)
    const preview = await act(page, `${taskPath}/${task.id}/release-preview`, 'POST', 200, () => releaseDialog.getByRole('button', { name: '生成发布预览', exact: true }).click())
    assert.match(preview.previewToken, /^[a-f0-9]{64}$/)
    assert.equal(preview.files.length, documentRefs.length, '所有BOM图纸必须进入真实发布预览')
    for (const ref of documentRefs) {
      const file = preview.files.find((item: any) => item.sourceAttachmentId === ref.attachmentId)
      assert.ok(file)
      assert.equal(file.sha256, ref.hash)
      assert.equal(file.versionLabel, ref.versionLabel)
    }
    await noOverflow(page, `${prefix} 发布预览`)
    await enabledState(page, releaseDialog.getByRole('button', { name: '确认正式发布', exact: true }), true,
      '资料预览完成后允许确认发布')
    await page.getByText('已登记任务进度记录', { exact: true }).waitFor({ state: 'hidden' })
    await screenshot(page, `${prefix}-release-preview.png`, false)
    const release = await act(page, `${taskPath}/${task.id}/releases`, 'POST', 201, () => releaseDialog.getByRole('button', { name: '确认正式发布', exact: true }).click())
    await releaseDialog.waitFor({ state: 'hidden' })
    assert.equal(release.manifest.files.length, documentRefs.length)
    for (const ref of documentRefs) {
      const frozenFile = release.manifest.files.find((file: any) => file.sourceAttachmentId === ref.attachmentId)
      assert.ok(frozenFile, '每个BOM图纸都必须进入不可变发布包')
      assert.equal(frozenFile.versionLabel, ref.versionLabel)
      assert.equal(frozenFile.sha256, ref.hash)
      assert.notEqual(frozenFile.attachmentId, ref.attachmentId, '每个发布文件必须创建冻结副本')
    }
    await visible(detail(page).getByRole('button', { name: '登记发放', exact: true }), '发布历史中的发放操作')
    await detail(page).getByRole('button', { name: '登记发放', exact: true }).click()
    const deliveryDialog = dialog(page, /^登记发放记录/)
    await deliveryDialog.getByLabel(/^发放方式/).selectOption('MANUAL')
    await deliveryDialog.getByLabel(/^发放状态/).selectOption('RECORDED')
    await deliveryDialog.getByLabel(/^发放凭证说明/).fill(`合成 ${prefix} 纸质领用回执，未真实外发`)
    const delivery = await act(page, `${taskPath}/${task.id}/releases/${release.id}/deliveries`, 'POST', 201, () => deliveryDialog.getByRole('button', { name: '保存发放记录', exact: true }).click())
    assert.equal(delivery.method, 'MANUAL')
    await deliveryDialog.waitFor({ state: 'hidden' })

    const exportedDelivery = page.waitForResponse((response: any) => new URL(response.url()).pathname === `${taskPath}/${task.id}/releases/${release.id}/deliveries` && response.request().method() === 'POST')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      detail(page).getByRole('button', { name: '导出 JSON 清单', exact: true }).click(),
    ])
    const downloadPath = await download.path()
    assert.ok(downloadPath, '导出应产生真实下载文件')
    const manifest = JSON.parse(readFileSync(downloadPath, 'utf8'))
    assert.equal(manifest.task.title, title)
    assert.equal(manifest.files[0].sha256, harness!.fixture.drawingHash)
    assert.equal((await responseData(await exportedDelivery, 201)).method, 'EXPORT')

    trackArchivedFileRequests = true
    const [archiveResponse] = await Promise.all([
      page.waitForResponse((response: any) => new URL(response.url()).pathname === `${taskPath}/${task.id}/archive` && response.request().method() === 'POST'),
      page.waitForEvent('dialog').then(async (confirmation: any) => {
        assert.match(confirmation.message(), /确定归档协同任务/)
        await confirmation.accept()
      }),
      detail(page).getByRole('button', { name: '归档', exact: true }).first().click(),
    ])
    task = await responseData(archiveResponse, 200)
    assert.ok(task.deletedAt)
    await openPageAction(page, '已归档')
    await openTask(page, task)
    const archivedRelease = detail(page).locator('article').filter({ hasText: `发布版本 Rev.${release.revision}` })
    await visible(archivedRelease, '任务归档后不可变发布版本与JSON清单仍可读')
    for (const frozenFile of release.manifest.files) {
      const fileButton = archivedRelease.getByRole('button').filter({ hasText: frozenFile.originalName })
      assert.equal(await fileButton.count() ? await fileButton.isEnabled() : false, false, '任务归档时历史冻结文件无可点击预览')
      assert.equal((await context.request.get(`${harness!.baseUrl}/api/attachments/${frozenFile.attachmentId}/file`)).status(), 404,
        '归档期间直接请求冻结副本仍由真实API拒绝')
    }
    const [archivedDownload] = await Promise.all([
      page.waitForEvent('download'),
      archivedRelease.getByRole('button', { name: '导出 JSON 清单', exact: true }).click(),
    ])
    const archivedManifest = JSON.parse(readFileSync(await archivedDownload.path(), 'utf8'))
    assert.equal(archivedManifest.task.title, title)
    assert.equal(archivedManifest.task.revision, release.revision)
    assert.deepEqual(archivedManifest.files.map((file: any) => ({ id: file.attachmentId, sha256: file.sha256, versionLabel: file.versionLabel })),
      release.manifest.files.map((file: any) => ({ id: file.attachmentId, sha256: file.sha256, versionLabel: file.versionLabel })), '归档后导出历史JSON不改变冻结版本')
    assert.deepEqual(archivedFileRequests, [], '归档操作与归档态UI均不应请求原文件、冻结文件或预览')
    await screenshot(page, `${prefix}-archived-release-history.png`)
    trackArchivedFileRequests = false
    task = await act(page, `${taskPath}/${task.id}/restore`, 'POST', 200, () => detail(page).getByRole('button', { name: '恢复归档', exact: true }).click())
    assert.equal(task.deletedAt, null)
    await openPageAction(page, '返回活动任务')
    await openTask(page, task)
    const restoredFile = release.manifest.files[0]
    const restoredRelease = detail(page).locator('article').filter({ hasText: `发布版本 Rev.${release.revision}` })
    const restoredPreview = page.waitForResponse((response: any) => new URL(response.url()).pathname === `/api/attachments/${restoredFile.attachmentId}/preview`
      && response.request().method() === 'GET')
    await restoredRelease.getByRole('button').filter({ hasText: restoredFile.originalName }).click()
    const previewResponse = await restoredPreview
    assert.equal(previewResponse.status(), 200, '恢复后TXT公共查看器读取真实冻结副本预览')
    assert.equal(await previewResponse.text(), harness!.fixture.drawing.toString())
    const viewer = page.getByRole('dialog', { name: restoredFile.originalName, exact: true })
    await visible(viewer, '从发布历史打开公共TXT查看器')
    const frame = viewer.locator('iframe')
    await visible(frame, '公共查看器使用TXT iframe')
    assert.equal(new URL(await frame.getAttribute('src'), harness!.baseUrl).pathname, `/api/attachments/${restoredFile.attachmentId}/preview`)
    const downloadLink = viewer.getByRole('link', { name: '下载原文件', exact: true })
    assert.equal(new URL(await downloadLink.getAttribute('href'), harness!.baseUrl).pathname, `/api/attachments/${restoredFile.attachmentId}/file`)
    // Chromium's download navigation does not emit page.response reliably; verify HTTP status through the same authenticated cookie context.
    const restoredFileResponse = await context.request.get(new URL(await downloadLink.getAttribute('href'), harness!.baseUrl).href)
    assert.equal(restoredFileResponse.status(), 200, '恢复后真实 frozenID/file 返回200')
    assert.equal(createHash('sha256').update(await restoredFileResponse.body()).digest('hex'), harness!.fixture.drawingHash)
    const [frozenDownload] = await Promise.all([
      page.waitForEvent('download'),
      downloadLink.click(),
    ])
    assert.equal(createHash('sha256').update(readFileSync(await frozenDownload.path())).digest('hex'), harness!.fixture.drawingHash)
    await noOverflow(page, `${prefix} 恢复后的冻结TXT公共查看器`)
    await screenshot(page, `${prefix}-restored-frozen-txt-viewer.png`, false)
    await viewer.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await viewer.waitFor({ state: 'hidden' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openTask(page, task)
    const persisted = await responseData(await context.request.get(`${harness!.baseUrl}${taskPath}/${task.id}`), 200)
    assert.equal(persisted.progress.length, 2)
    assert.equal(persisted.releases.length, 1)
    assert.equal(persisted.releases[0].deliveries.length, 2)
    assert.equal(persisted.lines[0].quantity, 2)
    assert.equal(persisted.lines[0].documentRefs.length, documentRefs.length)
    assert.equal(persisted.dueAt, expectedDueAt)
    await noOverflow(page, `${prefix} 历史回读`)
    await screenshot(page, `${prefix}-persisted.png`)
    results.push({ viewport, taskId: task.id, taskNo: task.taskNo, workflow: 'draft-bom-file-assign-note-exception-preview-release-delivery-export-archive-restore-frozen-txt-viewer-reload', localDueAt, savedDueAt: expectedDueAt, bomFileVersions: documentRefs.map(ref => ref.versionLabel), progress: 2, releases: 1, deliveries: 2,
      archivedFrozenFiles: 'no clickable preview or file requests; direct frozen file 404; historical JSON/version readable', restoredFrozenTxt: { id: restoredFile.attachmentId, previewStatus: 200, fileStatus: 200, sha256: harness!.fixture.drawingHash } })
    return task
  } catch (error) {
    await screenshot(page, `${prefix}-failure.png`).catch(() => {})
    writeFileSync(join(harness!.artifacts, `${prefix}-failure-controls.json`), JSON.stringify(await page.getByRole('button').evaluateAll((buttons: HTMLButtonElement[]) => buttons.map(button => ({ text: button.innerText, ariaLabel: button.getAttribute('aria-label'), title: button.title }))), null, 2))
    throw error
  } finally {
    releaseList()
    await context.close()
    currentPage = null
  }
}

async function checkReadOnlyAndScopes(task: UiTask) {
  for (const viewport of viewports) {
    const context = await localContext(viewport)
    await loginContext(context, harness!.actors.readOnly.username)
    const page = await context.newPage()
    currentPage = page
    monitor(page)
    try {
      await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
      await openTask(page, task)
      assert.equal(await page.getByRole('button', { name: '新建', exact: true }).count(), 0, '只读账号不得显示新建按钮')
      for (const name of ['编辑信息', '派工确认', '登记进度 / 异常', '发布资料清单', '登记发放', '归档']) {
        assert.equal(await detail(page).getByRole('button', { name, exact: true }).count(), 0, `只读账号不得显示 ${name}`)
      }
      assert.equal(await detail(page).locator('input[type="file"]').count(), 0, '只读账号不得出现上传控件')
      if (viewport.width === 1440) {
        const row = page.getByLabel(`查看协同任务 ${task.taskNo} ${task.title}`, { exact: true })
        const summary = row.getByLabel(/^附件 \d+ 个$/)
        await visible(summary, '桌面列表显示只读附件摘要')
        assert.equal(await summary.locator('input[type="file"]').count(), 0, '只读列表附件摘要不得隐藏上传控件')
        assert.equal(await summary.getByRole('button', { name: /上传|添加附件|归档/ }).count(), 0, '只读列表附件摘要不得显示变更动作')
      }
      const deniedWrite = await context.request.post(`${harness!.baseUrl}${taskPath}/${task.id}/progress`, {
        headers: { Origin: harness!.baseUrl }, data: { kind: 'NOTE', note: '只读越权请求必须拒绝' },
      })
      assert.equal(deniedWrite.status(), 403, '只读 UI 之外服务端仍须拒绝写入')
      await noOverflow(page, `${viewport.width} 只读`)
      await screenshot(page, `${viewport.width}-read-only.png`)
    } catch (error) {
      await screenshot(page, `${viewport.width}-read-only-failure.png`).catch(() => {})
      throw error
    } finally { await context.close(); currentPage = null }
  }
  for (const actor of [harness!.actors.denied, harness!.actors.outsider]) {
    const context = await localContext(viewports[0])
    await loginContext(context, actor.username)
    const page = await context.newPage()
    currentPage = page
    monitor(page)
    try {
      const authenticated = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/auth/me' && response.status() === 200)
      await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
      await authenticated
      const list = await context.request.get(`${harness!.baseUrl}${taskPath}`)
      if (actor.id === harness!.actors.denied.id) {
        assert.equal(list.status(), 403, '无任务资源权限拒绝查询')
        await visible(page.locator('[data-page-key="dashboard"]'), '无权直达任务URL后已认证首页回退完成')
        assert.equal(await page.locator('[data-page-key="taskCollaboration"]').count(), 0, '无权账号不能通过 URL 挂载任务页')
      } else {
        assert.equal((await responseData(list, 200)).length, 0, '范围外 SELF 账号应看到空列表')
        await visible(page.getByText('尚未创建协同任务', { exact: true }), '范围内无数据时显示空状态')
        assert.equal((await context.request.get(`${harness!.baseUrl}${taskPath}/${task.id}`)).status(), 403, '跨范围详情必须由真实 API 拒绝')
      }
      assert.equal(await page.getByText(task.title, { exact: true }).count(), 0, '无权或跨范围不能泄露任务标题')
      await screenshot(page, actor.id === harness!.actors.denied.id ? 'no-resource-permission.png' : 'outside-self-scope.png')
    } catch (error) {
      await screenshot(page, 'permission-scope-failure.png').catch(() => {})
      throw error
    } finally { await context.close(); currentPage = null }
  }
  results.push({ permissions: 'read-only both viewports; denied resource; foreign SELF scope; real API write/detail denials' })
}

async function checkStaleEdit(task: UiTask) {
  const context = await localContext(viewports[0])
  await loginContext(context, harness!.actors.author.username)
  const page = await context.newPage()
  currentPage = page
  monitor(page)
  try {
    await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
    await openTask(page, task)
    await detail(page).getByRole('button', { name: '编辑信息', exact: true }).click()
    const editDialog = dialog(page, /编辑协同任务/)
    await visible(editDialog, '旧版本编辑弹窗')
    const latest = await responseData(await context.request.get(`${harness!.baseUrl}${taskPath}/${task.id}`), 200)
    const beforeManifest = latest.releases[0].manifest
    const body = {
      title: latest.title, salesOrderId: latest.salesOrderId, productionOrderId: latest.productionOrderId,
      assigneeEmployeeId: latest.assigneeEmployeeId, supplierId: latest.supplierId, workCenterId: latest.workCenterId,
      quantity: latest.quantity, unit: latest.unit, dueAt: latest.dueAt, instructions: '合成并发修改，仅测试乐观锁',
      documentRefs: latest.documentRefs.map((ref: any) => ({ attachmentId: ref.attachmentId, versionLabel: ref.versionLabel })),
      lines: latest.lines.map((line: any) => ({ id: line.id, materialId: line.materialId, quantity: line.quantity, unit: line.unit, note: line.note,
        documentRefs: line.documentRefs.map((ref: any) => ({ attachmentId: ref.attachmentId, versionLabel: ref.versionLabel })) })),
      expectedRevision: latest.revision,
    }
    await responseData(await context.request.patch(`${harness!.baseUrl}${taskPath}/${task.id}`, {
      headers: { Origin: harness!.baseUrl }, data: body,
    }), 200)
    const failed = await act(page, `${taskPath}/${task.id}`, 'PATCH', 409, () => editDialog.getByRole('button', { name: '保存修改', exact: true }).click())
    assert.equal(failed.code, 'VERSION_CONFLICT')
    await visible(editDialog.getByRole('alert'), '真实409在原弹窗显示可理解错误')
    await screenshot(page, 'stale-edit-409.png')
    const refreshed = await responseData(await context.request.get(`${harness!.baseUrl}${taskPath}/${task.id}`), 200)
    assert.deepEqual(refreshed.releases[0].manifest, beforeManifest, '并发修改当前任务不能覆盖历史发布快照')
    results.push({ staleEdit: 'real API 409 rendered in dialog; historical release unchanged' })
  } catch (error) {
    await screenshot(page, 'stale-edit-failure.png').catch(() => {})
    throw error
  } finally { await context.close(); currentPage = null }
}

async function checkDialogIsolation(tasks: UiTask[]) {
  const context = await localContext(viewports[0])
  await loginContext(context, harness!.actors.author.username)
  const page = await context.newPage()
  currentPage = page
  monitor(page)
  try {
    await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
    for (const task of tasks) {
      await openTask(page, task)
      await detail(page).getByRole('button', { name: '编辑信息', exact: true }).click()
      const editDialog = dialog(page, /编辑协同任务/)
      await visible(editDialog, '切换任务后的编辑弹窗')
      assert.equal(await editDialog.getByLabel(/^任务标题/).inputValue(), task.title, '不同任务不得复用上一次编辑的标题')
      const expectedDate = task.title.includes('1440') ? '2026-11-03T09:15' : '2026-11-04T16:20'
      assert.equal(await editDialog.getByLabel(/^要求交期/).inputValue(), expectedDate, '不同任务的交期必须独立恢复')
      assert.deepEqual(await editDialog.getByPlaceholder('业务版本（选填，不填则留空）', { exact: true })
        .evaluateAll((inputs: HTMLInputElement[]) => inputs.map(input => input.value)),
      task.lines.flatMap((line: any) => line.documentRefs.map((ref: any) => ref.versionLabel)),
      '切换不同任务后BOM图纸数量和各版本必须独立恢复')
      await editDialog.getByLabel(/^任务标题/).fill('取消的合成修改不得泄漏')
      await page.keyboard.press('Escape')
      await editDialog.waitFor({ state: 'hidden' })
    }
    await openNew(page)
    const fresh = dialog(page, /新建协同任务草稿/)
    await visible(fresh, '编辑后再次新建')
    assert.equal(await fresh.getByLabel(/^任务标题/).inputValue(), '', '新建不能继承上一任务标题')
    assert.equal(await fresh.getByLabel(/^要求交期/).inputValue(), '', '新建不能继承交期')
    assert.equal(await fresh.getByPlaceholder('填写本任务特殊公差、表面处理、包装防护、检验抽样或外协交付要求…').inputValue(), '', '新建不能继承说明')
    assert.equal(await fresh.getByPlaceholder('业务版本（选填，不填则留空）', { exact: true }).count(), 0, '新建不能继承上一任务图纸引用')
    assert.equal(await fresh.getByRole('spinbutton', { name: new RegExp(`${harness!.fixture.material.name}数量$`) }).count(), 0, '新建不能继承上一任务BOM行')
    await screenshot(page, 'dialog-state-isolation.png')
    await page.keyboard.press('Escape')
    await fresh.waitFor({ state: 'hidden' })
    results.push({ dialogState: `${tasks.length} existing tasks and fresh draft reopen without cancelled edits, BOM or date leakage` })
  } catch (error) {
    await screenshot(page, 'dialog-state-isolation-failure.png').catch(() => {})
    throw error
  } finally { await context.close(); currentPage = null }
}

async function checkRecipientInvalidation(task: UiTask) {
  const context = await localContext(viewports[0])
  await loginContext(context, harness!.actors.author.username)
  const page = await context.newPage()
  currentPage = page
  monitor(page)
  try {
    await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
    await openTask(page, task)
    await detail(page).getByRole('button', { name: '发布资料清单', exact: true }).click()
    const releaseDialog = dialog(page, /^发布任务资料包/)
    const preview = await act(page, `${taskPath}/${task.id}/release-preview`, 'POST', 200,
      () => releaseDialog.getByRole('button', { name: '生成发布预览', exact: true }).click())
    const confirm = releaseDialog.getByRole('button', { name: '确认正式发布', exact: true })
    await enabledState(page, confirm, true, '有效预览提交后可正式发布')
    await releaseDialog.getByLabel(/^收件对象类型/).selectOption('INTERNAL')
    await enabledState(page, confirm, false, '改变收件对象类型后旧previewToken不得继续用于发布')
    await releaseDialog.getByLabel(/^收件方名称/).fill('合成内部收件人甲')
    await act(page, `${taskPath}/${task.id}/release-preview`, 'POST', 200,
      () => releaseDialog.getByRole('button', { name: /^(生成发布预览|重新生成预览)$/ }).click())
    await enabledState(page, confirm, true, '收件人甲的新预览可发布')
    await releaseDialog.getByLabel(/^收件方名称/).fill('合成内部收件人乙')
    await enabledState(page, confirm, false, '改变收件方名称也必须使预览失效')
    const changedRecipient = { kind: 'INTERNAL', name: '合成内部收件人乙' }
    const staleResponse = await context.request.post(`${harness!.baseUrl}${taskPath}/${task.id}/releases`, {
      headers: { Origin: harness!.baseUrl }, data: { expectedRevision: preview.revision, operationId: randomUUID(), previewToken: preview.previewToken, recipient: changedRecipient },
    })
    assert.equal(staleResponse.status(), 409, '真实API也必须拒绝预览后更改收件人')
    await screenshot(page, 'recipient-preview-invalidated.png')
    results.push({ recipientInvalidation: 'type/name changes disable publish; real stale-recipient API publish rejected with 409' })
  } catch (error) {
    await screenshot(page, 'recipient-preview-failure.png').catch(() => {})
    throw error
  } finally { await context.close(); currentPage = null }
}

async function checkPaginationAndRemoteOptions(target: UiTask, baselineTasks = 2) {
  const context = await localContext(viewports[0])
  await loginContext(context, harness!.actors.author.username)
  const page = await context.newPage()
  currentPage = page
  monitor(page)
  try {
    // Prerequisites are written through authenticated local APIs; no bypass of task/material validation.
    for (let index = 1; index <= 55; index++) {
      await responseData(await context.request.post(`${harness!.baseUrl}${taskPath}`, {
        headers: { Origin: harness!.baseUrl }, data: { title: `分页合成任务-${String(index).padStart(3, '0')}`, quantity: 1, unit: '件',
          assigneeEmployeeId: harness!.fixture.employee.id, workCenterId: harness!.fixture.workCenter.id, documentRefs: [], lines: [] },
      }), 201)
    }
    let remoteMaterial: any
    for (let index = 1; index <= 60; index++) {
      const suffix = String(index).padStart(3, '0')
      remoteMaterial = await responseData(await context.request.post(`${harness!.baseUrl}/api/materials`, {
        headers: { Origin: harness!.baseUrl }, data: { code: `UI-REMOTE-${suffix}`, name: `远程检索合成物料${suffix}`, category: 'RAW', unit: '件', stockUnit: '件', valuationUnit: '件' },
      }), 201)
    }
    const initialOptions = await responseData(await context.request.get(`${harness!.baseUrl}${taskPath}/options?type=materials`), 200)
    assert.equal(initialOptions.length, 50)
    assert.equal(initialOptions.some((item: any) => item.id === remoteMaterial.id), false, '远程选择目标必须确实在初始50项之外')
    await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
    await visible(page.locator('footer[aria-label="任务协同分页导航"]'), '显示真实分页控件')
    const pageSizeResponse = page.waitForResponse((response: any) => new URL(response.url()).pathname === taskPath
      && new URL(response.url()).searchParams.get('page') === '1' && new URL(response.url()).searchParams.get('pageSize') === '50'
      && response.request().method() === 'GET')
    await page.getByLabel('每页条数', { exact: true }).selectOption('50')
    await pageSizeResponse
    await page.getByText('正在加载任务协同数据…', { exact: true }).waitFor({ state: 'hidden' })
    const initialList = await context.request.get(`${harness!.baseUrl}${taskPath}?page=1&pageSize=50`)
    const firstPage = await initialList.json()
    assert.equal(firstPage.pagination.total, baselineTasks + 55)
    assert.equal(firstPage.data.some((item: any) => item.id === target.id), false, '翻页目标必须位于50项之外')
    const row = page.getByLabel(`查看协同任务 ${target.taskNo} ${target.title}`, { exact: true })
    const next = page.getByRole('button', { name: '下一页', exact: true })
    await visible(next, '下一页可操作')
    const pageResponse = page.waitForResponse((response: any) => new URL(response.url()).pathname === taskPath
      && new URL(response.url()).searchParams.get('page') === '2' && response.request().method() === 'GET')
    await next.click()
    const secondPage = await (await pageResponse).json()
    assert.equal(secondPage.pagination.page, 2)
    await visible(row, '第50项之后的任务通过下一页可达')
    await openTask(page, target)
    await screenshot(page, 'pagination-after-fifty.png')
    await openNew(page)
    const draftDialog = dialog(page, /新建协同任务草稿/)
    await visible(draftDialog, '远程检索新建弹窗')
    await draftDialog.getByLabel(/^任务标题/).fill('UI远程第60物料保存')
    await draftDialog.getByLabel(/^计划数量/).fill('1')
    await draftDialog.getByLabel(/^单位/).fill('件')
    const remoteResponse = page.waitForResponse((response: any) => {
      const url = new URL(response.url())
      return url.pathname === `${taskPath}/options` && url.searchParams.get('type') === 'materials'
        && url.searchParams.get('keyword') === remoteMaterial.name
    })
    await choose(page, '搜索物料编码、名称或规格，选择后立即加入任务 BOM 明细', remoteMaterial.name, false)
    const remoteOptions = await (await remoteResponse).json()
    assert.ok(remoteOptions.data.some((item: any) => item.id === remoteMaterial.id), '输入远端关键词必须触发真实options API并返回第60项')
    const saved = await act(page, taskPath, 'POST', 201, () => draftDialog.getByRole('button', { name: '保存任务草稿', exact: true }).click())
    assert.equal(saved.lines[0].materialId, remoteMaterial.id, '第60个候选选择必须能真实保存为BOM引用')
    results.push({ pagination: `${baselineTasks + 55} tasks; page size 50 and page 2 reachable`, remoteOptions: '61 materials; 60th remote candidate searched and saved using real APIs' })
    return 56
  } catch (error) {
    await screenshot(page, 'pagination-remote-options-failure.png').catch(() => {})
    throw error
  } finally { await context.close(); currentPage = null }
}

async function checkAttachmentCreatePermissions(task: UiTask) {
  const failures: string[] = []
  for (const actor of [harness!.actors.missingAttachments, harness!.actors.updateAttachmentsOnly]) {
    const context = await localContext(viewports[0])
    await loginContext(context, actor.username)
    const page = await context.newPage()
    currentPage = page
    monitor(page)
    try {
      await page.goto(`${harness!.baseUrl}/?page=taskCollaboration`, { waitUntil: 'domcontentloaded' })
      // Bulk fixtures put the original task on page two; use server search to inspect it without granting more rights.
      const search = page.getByRole('searchbox', { name: '搜索任务单号、标题、作业说明、负责人或供应商', exact: true })
      await visible(search, '权限场景任务检索')
      await search.fill(task.title)
      await openTask(page, task)
      const me = await responseData(await context.request.get(`${harness!.baseUrl}/api/auth/me`), 200)
      assert.equal(me.permissions.attachments.canCreate, false)
      if (actor.id === harness!.actors.updateAttachmentsOnly.id) assert.equal(me.permissions.attachments.canUpdate, true)
      const uploadControls = await detail(page).locator('input[type="file"]').count()
      const upload = await context.request.post(`${harness!.baseUrl}/api/attachments`, {
        headers: { Origin: harness!.baseUrl }, multipart: { ownerType: 'TASK_COLLABORATION', ownerId: task.id, documentType: 'ORIGINAL',
          file: { name: 'denied-synthetic-upload.txt', mimeType: 'text/plain', buffer: harness!.fixture.drawing } },
      })
      assert.equal(upload.status(), 403, '服务端附件create权限必须独立拒绝')
      results.push({ attachmentActor: actor.username, canCreate: false, uploadControls, uploadPostStatus: upload.status() })
      assert.equal(uploadControls, 0, '无attachments.create，即使task和attachments可update，也必须无上传控件')
      if (actor.id === harness!.actors.updateAttachmentsOnly.id) {
        assert.equal(me.permissions.attachments.canDelete, true)
        await visible(detail(page).getByRole('button', { name: '归档', exact: true }).nth(1), '附件列表返回后显示独立附件归档动作')
        assert.ok(await detail(page).getByRole('button', { name: '归档', exact: true }).count() > 1,
          '附件canDelete独立为true时，既有附件归档动作不能因无create被连带隐藏')
      }
      await screenshot(page, actor.id === harness!.actors.missingAttachments.id ? 'missing-attachments-permission.png' : 'attachments-update-without-create.png')
    } catch (error) {
      await screenshot(page, `${actor.username}-permission-failure.png`).catch(() => {})
      failures.push(`${actor.username}: ${String(error)}`)
    } finally { await context.close(); currentPage = null }
  }
  assert.deepEqual(failures, [], '独立附件权限场景失败（全部账号均已检查）')
  results.push({ attachmentPermissions: 'missing attachments and update-without-create both hide upload; real POST denied' })
}

async function main() {
  const mobileOnly = process.argv.includes('--mobile-only')
  const desktopExtra = process.argv.includes('--desktop-extra')
  const attachmentOnly = process.argv.includes('--attachment-only')
  assert.ok([mobileOnly, desktopExtra, attachmentOnly].filter(Boolean).length <= 1, '只能选择一个定向场景过滤器')
  const playwright = loadTaskUiPlaywright()
  harnessStarting = startTaskUiHarness()
  harness = await harnessStarting
  if (stopping) throw new Error('本地界面验证已收到终止信号')
  console.log('任务协同 UI stage: 隔离临时数据库与本地 Next 已就绪')
  browserStarting = playwright.chromium.launch({ headless: true })
  browser = await browserStarting
  if (stopping) throw new Error('本地界面验证已收到终止信号')
  if (attachmentOnly) {
    console.log('任务协同 UI stage: 精简附件权限前提数据与独立边界')
    const context = await localContext(viewports[0])
    let task: UiTask
    try {
      await loginContext(context, harness.actors.author.username)
      task = await responseData(await context.request.post(`${harness.baseUrl}${taskPath}`, {
        headers: { Origin: harness.baseUrl }, data: { title: 'UI 附件独立权限合成任务', quantity: 1, unit: '件',
          assigneeEmployeeId: harness.fixture.employee.id, workCenterId: harness.fixture.workCenter.id, documentRefs: [], lines: [] },
      }), 201)
      await responseData(await context.request.post(`${harness.baseUrl}/api/attachments`, {
        headers: { Origin: harness.baseUrl }, multipart: { ownerType: 'TASK_COLLABORATION', ownerId: task.id, documentType: 'ORIGINAL',
          file: { name: 'synthetic-permission-original.txt', mimeType: 'text/plain', buffer: harness.fixture.drawing } },
      }), 201)
    } finally { await context.close() }
    await checkAttachmentCreatePermissions(task)
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    assert.equal(blockedOrigins.size, 0)
    assert.equal(await harness.db.stockLog.count(), 0)
    assert.equal(await harness.db.costRecord.count(), 0)
    writeFileSync(join(harness.artifacts, 'result.json'), JSON.stringify({ status: 'passed', mode: 'attachment-only', localOnly: true, results, pageErrors, consoleErrors }, null, 2))
    console.log(`任务协同附件权限真实浏览器联调通过。证据：${harness.artifacts}`)
    return
  }
  const tasks: UiTask[] = []
  const selectedViewports = mobileOnly ? [viewports[1]] : desktopExtra ? [viewports[0]] : viewports
  for (const viewport of selectedViewports) {
    console.log(`任务协同 UI stage: ${viewport.width} 完整闭环`)
    tasks.push(await exerciseFlow(viewport))
  }
  let additionalTasks = 0
  const scenarioFailures: string[] = []
  const scenario = async (name: string, run: () => Promise<unknown>) => {
    console.log(`任务协同 UI stage: ${name}`)
    try { await run() } catch (error) {
      scenarioFailures.push(`${name}: ${String(error)}`)
      results.push({ scenario: name, status: 'failed', error: String(error) })
      console.error(`独立场景失败：${name}: ${String(error)}`)
    }
  }
  if (!mobileOnly) {
    await scenario('弹窗隔离', () => checkDialogIsolation(tasks))
    await scenario('只读/无权/范围', () => checkReadOnlyAndScopes(tasks[0]))
    await scenario('并发版本冲突', () => checkStaleEdit(tasks[0]))
    await scenario('发布预览收件人失效', () => checkRecipientInvalidation(tasks[0]))
    await scenario('任务分页与远程第60项物料', async () => { additionalTasks = await checkPaginationAndRemoteOptions(tasks[0], tasks.length) })
    await scenario('附件 create 权限独立边界', () => checkAttachmentCreatePermissions(tasks[0]))
  }
  assert.equal(await harness.db.stockLog.count(), 0, 'UI 协同完整流程不产生库存流水')
  assert.equal(await harness.db.costRecord.count(), 0, 'UI 协同完整流程不产生成本记录')
  if (!scenarioFailures.length) assert.equal(await harness.db.taskCollaboration.count(), tasks.length + additionalTasks)
  assert.equal(await harness.db.taskCollaborationRelease.count(), tasks.length)
  assert.equal(await harness.db.taskCollaborationDelivery.count(), tasks.length * 2)
  assert.ok(await harness.db.auditLog.count({ where: { entityType: 'TASK_COLLABORATION' } }) >= tasks.length * 8, '业务动作应保留真实审计')
  assert.deepEqual(pageErrors, [], '浏览器不得有运行异常或 React hydration 异常')
  assert.deepEqual(consoleErrors, [], '浏览器不得有未解释的 console.error')
  assert.equal(blockedOrigins.size, 0, '本地 UI 不应尝试访问外部或生产服务')
  assert.deepEqual(scenarioFailures, [], '独立场景失败；各场景均已尝试并保留截图')
  writeFileSync(join(harness.artifacts, 'result.json'), JSON.stringify({ status: 'passed', localOnly: true, results, pageErrors, consoleErrors }, null, 2))
  console.log(`任务协同真实浏览器联调通过：${selectedViewports.map(item => item.width).join('/')} 完整UI闭环${mobileOnly ? '' : '及独立扩展场景'}。证据：${harness.artifacts}`)
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]] as const) process.once(signal, () => {
  stopping = true
  void cleanupAll().finally(() => process.exit(exitCode))
})

main().catch(async error => {
  if (harness) {
    try { if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, 'failure.png') } catch { /* retain original failure */ }
    writeFileSync(join(harness.artifacts, 'result.json'), JSON.stringify({ status: 'failed', localOnly: true, error: String(error), results, pageErrors, consoleErrors }, null, 2))
    writeFileSync(join(harness.artifacts, 'next-dev.log'), harness.serverLog())
  }
  console.error(error)
  process.exitCode = 1
}).finally(cleanupAll)
