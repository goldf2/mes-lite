import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = process.cwd()
const sourceDir = join(root, 'docs/operations/user-guide/workflow-videos')
const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const versionArgumentIndex = process.argv.indexOf('--version')
const versionOverride = versionArgumentIndex >= 0 ? process.argv[versionArgumentIndex + 1] : undefined

if (versionArgumentIndex >= 0 && !versionOverride) throw new Error('用法：node scripts/verify-workflow-video-outputs.mjs [--version 0.1.394]')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function metadata(path, attribute) {
  return execFileSync('/usr/bin/mdls', ['-raw', '-name', attribute, path], { encoding: 'utf8' }).trim()
}

function parseTimestamp(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/)
  assert(match, `无效 SRT 时间：${value}`)
  const [, hours, minutes, seconds, milliseconds] = match.map(Number)
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function parseSubtitles(content) {
  return content.trim().split(/\r?\n\r?\n/).map((block) => {
    const lines = block.split(/\r?\n/)
    assert(lines.length >= 3, `无效 SRT 块：${block}`)
    const range = lines[1].match(/^(\S+) --> (\S+)$/)
    assert(range, `无效 SRT 时间段：${lines[1]}`)
    return { start: parseTimestamp(range[1]), end: parseTimestamp(range[2]), text: lines.slice(2).join('\n') }
  })
}

const sourceFiles = readdirSync(sourceDir).filter((file) => /^\d{2}-.+\.json$/.test(file)).sort()
assert(sourceFiles.length > 0, '没有找到工作流视频分镜')

for (const sourceFile of sourceFiles) {
  const source = JSON.parse(readFileSync(join(sourceDir, sourceFile), 'utf8'))
  const version = versionOverride ?? source.contentVersion ?? packageInfo.version
  const stem = `${source.outputName}-v${version}`
  const outputDir = join(root, 'output/tutorials', stem)
  const previewVideo = join(outputDir, `${stem}-配音字幕预览.mp4`)
  const cleanVideo = join(outputDir, `${stem}-无配音母版.mp4`)
  const subtitlePath = join(outputDir, `${stem}.srt`)
  const narrationPath = join(outputDir, `${stem}-旁白稿.md`)
  const previewImage = join(outputDir, `${stem}-preview.png`)

  for (const path of [previewVideo, cleanVideo, subtitlePath, narrationPath, previewImage]) {
    assert(existsSync(path), `${basename(outputDir)} 缺少输出：${basename(path)}`)
  }

  const subtitles = parseSubtitles(readFileSync(subtitlePath, 'utf8'))
  assert(subtitles.length === source.scenes.length, `${stem} 的字幕数量与分镜数量不一致`)
  for (const [index, subtitle] of subtitles.entries()) {
    assert(subtitle.end > subtitle.start, `${stem} 第 ${index + 1} 条字幕时长无效`)
    assert(subtitle.text === source.scenes[index].narration, `${stem} 第 ${index + 1} 条字幕与旁白不一致`)
    if (index > 0) assert(subtitle.start >= subtitles[index - 1].end, `${stem} 第 ${index}、${index + 1} 条字幕重叠`)
  }

  const duration = Number(metadata(previewVideo, 'kMDItemDurationSeconds'))
  const width = Number(metadata(previewVideo, 'kMDItemPixelWidth'))
  const height = Number(metadata(previewVideo, 'kMDItemPixelHeight'))
  const previewCodecs = metadata(previewVideo, 'kMDItemCodecs')
  const cleanCodecs = metadata(cleanVideo, 'kMDItemCodecs')
  assert(width === 1920 && height === 1080, `${stem} 不是 1920×1080`)
  assert(duration >= subtitles.at(-1).end && duration - subtitles.at(-1).end <= 1, `${stem} 的字幕结尾与视频时长不一致`)
  assert(previewCodecs.includes('H.264') && previewCodecs.includes('AAC'), `${stem} 的配音预览缺少 H.264 或 AAC`)
  assert(cleanCodecs.includes('H.264') && !cleanCodecs.includes('AAC'), `${stem} 的无配音母版包含音频或缺少 H.264`)
  assert(metadata(previewImage, 'kMDItemPixelWidth') === '1920' && metadata(previewImage, 'kMDItemPixelHeight') === '1080', `${stem} 的预览图尺寸错误`)

  const narration = readFileSync(narrationPath, 'utf8')
  assert((narration.match(/^## /gm) ?? []).length === source.scenes.length, `${stem} 的旁白稿段落数量与分镜不一致`)
  console.log(`视频输出校验通过：${source.id}，${source.scenes.length} 个分镜，${duration.toFixed(1)} 秒`)
}

console.log(`已校验 ${sourceFiles.length} 组工作流视频输出。`)
