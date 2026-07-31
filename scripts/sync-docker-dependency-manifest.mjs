import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(projectRoot, 'docker', 'dependencies')
const cacheVersion = '0.0.0-docker-cache'

const packagePath = path.join(projectRoot, 'package.json')
const lockPath = path.join(projectRoot, 'package-lock.json')
const outputPackagePath = path.join(outputDirectory, 'package.json')
const outputLockPath = path.join(outputDirectory, 'package-lock.json')

const [packageSource, lockSource] = await Promise.all([
  readFile(packagePath, 'utf8'),
  readFile(lockPath, 'utf8'),
])

const packageJson = JSON.parse(packageSource)
const packageLock = JSON.parse(lockSource)

const dependencyManifest = {
  name: packageJson.name,
  version: cacheVersion,
  private: true,
  ...(packageJson.engines ? { engines: packageJson.engines } : {}),
  ...(packageJson.dependencies ? { dependencies: packageJson.dependencies } : {}),
  ...(packageJson.devDependencies ? { devDependencies: packageJson.devDependencies } : {}),
  ...(packageJson.optionalDependencies ? { optionalDependencies: packageJson.optionalDependencies } : {}),
  ...(packageJson.peerDependencies ? { peerDependencies: packageJson.peerDependencies } : {}),
  ...(packageJson.peerDependenciesMeta ? { peerDependenciesMeta: packageJson.peerDependenciesMeta } : {}),
  ...(packageJson.overrides ? { overrides: packageJson.overrides } : {}),
}

const dependencyLock = structuredClone(packageLock)
dependencyLock.name = packageJson.name
dependencyLock.version = cacheVersion

if (!dependencyLock.packages?.['']) {
  throw new Error('package-lock.json 缺少根项目 packages[""] 记录')
}

dependencyLock.packages[''].name = packageJson.name
dependencyLock.packages[''].version = cacheVersion

const expectedPackage = `${JSON.stringify(dependencyManifest, null, 2)}\n`
const expectedLock = `${JSON.stringify(dependencyLock, null, 2)}\n`
const checkOnly = process.argv.includes('--check')

if (checkOnly) {
  const [actualPackage, actualLock] = await Promise.all([
    readFile(outputPackagePath, 'utf8').catch(() => ''),
    readFile(outputLockPath, 'utf8').catch(() => ''),
  ])

  if (actualPackage !== expectedPackage || actualLock !== expectedLock) {
    console.error('Docker 依赖清单已过期，请运行 npm run docker:sync-deps 后提交生成文件。')
    process.exit(1)
  }

  console.log('Docker 依赖清单与 package.json/package-lock.json 一致。')
  process.exit(0)
}

await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(outputPackagePath, expectedPackage),
  writeFile(outputLockPath, expectedLock),
])

console.log('已同步 Docker 依赖清单；项目发布版本号不会影响该清单。')
