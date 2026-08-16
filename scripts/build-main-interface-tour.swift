#!/usr/bin/env swift

import AppKit
import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO

struct Spotlight: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let label: String
}

struct Scene: Decodable {
    let style: String?
    let sourceImage: String
    let title: String
    let subtitle: String
    let narration: String
    let spotlights: [Spotlight]?
}

struct TourManifest: Decodable {
    let title: String
    let outputName: String?
    let contentVersion: String?
    let voice: String
    let speechRate: Int
    let scenes: [Scene]
}

struct PackageInfo: Decodable {
    let version: String
}

struct RenderedScene: Encodable {
    let index: Int
    let title: String
    let slide: String
    let cleanSlide: String
    let audio: String
    let narrationDuration: Double
    let duration: Double
}

struct RenderedTimeline: Encodable {
    let version: String
    let width: Int
    let height: Int
    let fps: Int
    let scenes: [RenderedScene]
}

enum TourError: Error, CustomStringConvertible {
    case invalidArguments
    case missingFile(String)
    case commandFailed(String)
    case imageRenderFailed(String)
    case videoEncodingFailed(String)
    case exportFailed(String)

    var description: String {
        switch self {
        case .invalidArguments:
            return "用法：swift scripts/build-main-interface-tour.swift <视频 SOP 分镜 JSON>"
        case .missingFile(let path):
            return "文件不存在：\(path)"
        case .commandFailed(let message), .imageRenderFailed(let message), .videoEncodingFailed(let message), .exportFailed(let message):
            return message
        }
    }
}

let canvasWidth = 1920
let canvasHeight = 1080
let framesPerSecond: Int32 = 30
let narrationLeadIn = 0.6
let scenePadding = 1.4
let fileManager = FileManager.default
let rootURL = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)

func readJSON<T: Decodable>(_ type: T.Type, from url: URL) throws -> T {
    guard fileManager.fileExists(atPath: url.path) else { throw TourError.missingFile(url.path) }
    return try JSONDecoder().decode(type, from: Data(contentsOf: url))
}

func runCommand(_ executable: String, _ arguments: [String]) throws -> String {
    let process = Process()
    let output = Pipe()
    let error = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = output
    process.standardError = error
    try process.run()
    process.waitUntilExit()
    let stdout = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let stderr = String(data: error.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    guard process.terminationStatus == 0 else {
        throw TourError.commandFailed("命令失败：\(executable) \(arguments.joined(separator: " "))\n\(stderr)")
    }
    return stdout + stderr
}

func estimatedAudioDuration(at url: URL) throws -> Double {
    let info = try runCommand("/usr/bin/afinfo", [url.path])
    let pattern = #"estimated duration:\s*([0-9.]+) sec"#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: info, range: NSRange(info.startIndex..., in: info)),
          let durationRange = Range(match.range(at: 1), in: info),
          let duration = Double(info[durationRange]) else {
        throw TourError.commandFailed("无法读取旁白时长：\(url.path)")
    }
    return duration
}

func fillRoundedRect(_ rect: NSRect, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func drawText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .left, lineSpacing: CGFloat = 6) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineSpacing = lineSpacing
    (text as NSString).draw(
        with: rect,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
        ]
    )
}

func renderSlide(scene: Scene, sourceURL: URL, destinationURL: URL, version: String, showNarration: Bool) throws {
    guard let sourceImage = NSImage(contentsOf: sourceURL) else {
        throw TourError.imageRenderFailed("无法读取界面截图：\(sourceURL.path)")
    }
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: canvasWidth,
        pixelsHigh: canvasHeight,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw TourError.imageRenderFailed("无法创建 1080p 分镜位图")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphicsContext
    defer { NSGraphicsContext.restoreGraphicsState() }
    graphicsContext.imageInterpolation = .high
    let coverStyle = scene.style == "cover"
    let screenshotRect = coverStyle
        ? NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)
        : NSRect(x: 196, y: 110, width: 1528, height: 860)
    NSColor(calibratedRed: 0.025, green: 0.055, blue: 0.12, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight).fill()
    sourceImage.draw(
        in: screenshotRect,
        from: NSRect(origin: .zero, size: sourceImage.size),
        operation: .copy,
        fraction: 1
    )

    if coverStyle {
        NSColor(calibratedWhite: 0.03, alpha: 0.72).setFill()
        NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight).fill()
        drawText(scene.title, in: NSRect(x: 170, y: 580, width: 1580, height: 120), font: .systemFont(ofSize: 64, weight: .bold), color: .white, alignment: .center)
        drawText(scene.subtitle, in: NSRect(x: 220, y: 480, width: 1480, height: 80), font: .systemFont(ofSize: 34, weight: .medium), color: NSColor(calibratedRed: 0.72, green: 0.84, blue: 1, alpha: 1), alignment: .center)
        fillRoundedRect(NSRect(x: 740, y: 392, width: 440, height: 58), radius: 29, color: NSColor(calibratedRed: 0.08, green: 0.36, blue: 0.92, alpha: 0.96))
        drawText("系统 v\(version)", in: NSRect(x: 740, y: 404, width: 440, height: 34), font: .systemFont(ofSize: 24, weight: .semibold), color: .white, alignment: .center)
    } else {
        drawText(scene.title, in: NSRect(x: 196, y: 1020, width: 1528, height: 42), font: .systemFont(ofSize: 34, weight: .bold), color: .white)
        drawText(scene.subtitle, in: NSRect(x: 196, y: 982, width: 1528, height: 30), font: .systemFont(ofSize: 21, weight: .medium), color: NSColor(calibratedRed: 0.72, green: 0.84, blue: 1, alpha: 1))

        let scaleX = Double(screenshotRect.width) / 1280.0
        let scaleY = Double(screenshotRect.height) / 720.0
        for spotlight in scene.spotlights ?? [] {
            let rect = NSRect(
                x: Double(screenshotRect.minX) + spotlight.x * scaleX,
                y: Double(screenshotRect.minY) + Double(screenshotRect.height) - (spotlight.y + spotlight.height) * scaleY,
                width: spotlight.width * scaleX,
                height: spotlight.height * scaleY
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: 14, yRadius: 14)
            path.lineWidth = 6
            NSColor(calibratedRed: 1, green: 0.74, blue: 0.12, alpha: 1).setStroke()
            path.stroke()
            let labelWidth = min(520.0, max(240.0, Double(spotlight.label.count * 25 + 48)))
            let labelY = rect.maxY + 12 + 46 < screenshotRect.maxY ? rect.maxY + 12 : rect.minY - 58
            let labelRect = NSRect(
                x: max(screenshotRect.minX + 12, min(rect.minX, screenshotRect.maxX - labelWidth - 12)),
                y: labelY,
                width: labelWidth,
                height: 46
            )
            fillRoundedRect(labelRect, radius: 12, color: NSColor(calibratedRed: 0.08, green: 0.24, blue: 0.55, alpha: 0.96))
            drawText(spotlight.label, in: NSRect(x: labelRect.minX + 16, y: labelRect.minY + 9, width: labelRect.width - 32, height: 30), font: .systemFont(ofSize: 20, weight: .semibold), color: .white)
        }
    }

    if showNarration && coverStyle {
        fillRoundedRect(NSRect(x: 72, y: 38, width: 1776, height: 142), radius: 24, color: NSColor(calibratedWhite: 0.02, alpha: 0.78))
        drawText(scene.narration, in: NSRect(x: 112, y: 68, width: 1696, height: 88), font: .systemFont(ofSize: 30, weight: .medium), color: .white, alignment: .center, lineSpacing: 8)
    } else if showNarration {
        drawText(scene.narration, in: NSRect(x: 196, y: 22, width: 1528, height: 72), font: .systemFont(ofSize: 23, weight: .medium), color: .white, alignment: .center, lineSpacing: 5)
    }

    graphicsContext.flushGraphics()
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw TourError.imageRenderFailed("无法生成分镜图片：\(destinationURL.path)")
    }
    try png.write(to: destinationURL)
}

func pixelBuffer(from image: CGImage, width: Int, height: Int) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let attributes: [String: Any] = [
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attributes as CFDictionary, &buffer)
    guard status == kCVReturnSuccess, let buffer else {
        throw TourError.videoEncodingFailed("无法创建视频像素缓冲区：\(status)")
    }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
        throw TourError.videoEncodingFailed("无法创建视频绘图上下文")
    }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buffer
}

func loadCGImage(from url: URL) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw TourError.imageRenderFailed("无法为视频读取分镜：\(url.path)")
    }
    return image
}

func writeSilentVideo(scenes: [RenderedScene], to outputURL: URL, includeNarrationCaptions: Bool) throws {
    if fileManager.fileExists(atPath: outputURL.path) { try fileManager.removeItem(at: outputURL) }
    let fileType: AVFileType = outputURL.pathExtension.lowercased() == "mp4" ? .mp4 : .mov
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: fileType)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: canvasWidth,
        AVVideoHeightKey: canvasHeight,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 6_000_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: canvasWidth,
            kCVPixelBufferHeightKey as String: canvasHeight,
        ]
    )
    guard writer.canAdd(input) else { throw TourError.videoEncodingFailed("视频编码器不接受当前输入") }
    writer.add(input)
    guard writer.startWriting() else { throw TourError.videoEncodingFailed(writer.error?.localizedDescription ?? "视频编码启动失败") }
    writer.startSession(atSourceTime: .zero)

    var frameIndex: Int64 = 0
    for scene in scenes {
        let captionImage = try loadCGImage(from: URL(fileURLWithPath: scene.slide))
        let cleanImage = try loadCGImage(from: URL(fileURLWithPath: scene.cleanSlide))
        let captionBuffer = try pixelBuffer(from: captionImage, width: canvasWidth, height: canvasHeight)
        let cleanBuffer = try pixelBuffer(from: cleanImage, width: canvasWidth, height: canvasHeight)
        let frameCount = max(1, Int((scene.duration * Double(framesPerSecond)).rounded()))
        for localFrame in 0..<frameCount {
            while !input.isReadyForMoreMediaData {
                if writer.status == .failed { throw TourError.videoEncodingFailed(writer.error?.localizedDescription ?? "视频编码失败") }
                Thread.sleep(forTimeInterval: 0.002)
            }
            let time = CMTime(value: frameIndex, timescale: framesPerSecond)
            let localSeconds = Double(localFrame) / Double(framesPerSecond)
            let showsNarration = includeNarrationCaptions && localSeconds >= narrationLeadIn && localSeconds < narrationLeadIn + scene.narrationDuration
            let buffer = showsNarration ? captionBuffer : cleanBuffer
            guard adaptor.append(buffer, withPresentationTime: time) else {
                throw TourError.videoEncodingFailed(writer.error?.localizedDescription ?? "写入视频帧失败")
            }
            frameIndex += 1
        }
    }
    input.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: frameIndex, timescale: framesPerSecond))
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    guard writer.status == .completed else {
        throw TourError.videoEncodingFailed(writer.error?.localizedDescription ?? "视频编码未完成")
    }
}

func combineVideoAndNarration(scenes: [RenderedScene], silentVideoURL: URL, outputURL: URL) throws {
    if fileManager.fileExists(atPath: outputURL.path) { try fileManager.removeItem(at: outputURL) }
    let composition = AVMutableComposition()
    let videoAsset = AVURLAsset(url: silentVideoURL)
    guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first,
          let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw TourError.exportFailed("无法读取静音视频轨道")
    }
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: videoAsset.duration), of: sourceVideoTrack, at: .zero)
    videoTrack.preferredTransform = sourceVideoTrack.preferredTransform

    guard let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw TourError.exportFailed("无法创建旁白轨道")
    }
    var cursor = CMTime.zero
    for scene in scenes {
        let audioAsset = AVURLAsset(url: URL(fileURLWithPath: scene.audio))
        guard let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first else {
            throw TourError.exportFailed("无法读取旁白：\(scene.audio)")
        }
        let start = CMTimeAdd(cursor, CMTime(seconds: narrationLeadIn, preferredTimescale: 600))
        try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: audioAsset.duration), of: sourceAudioTrack, at: start)
        cursor = CMTimeAdd(cursor, CMTime(seconds: scene.duration, preferredTimescale: 600))
    }

    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        throw TourError.exportFailed("无法创建 MP4 导出任务")
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true
    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    guard exporter.status == .completed else {
        throw TourError.exportFailed(exporter.error?.localizedDescription ?? "MP4 导出失败")
    }
}

func srtTimestamp(_ seconds: Double) -> String {
    let totalMilliseconds = max(0, Int((seconds * 1000).rounded()))
    let hours = totalMilliseconds / 3_600_000
    let minutes = (totalMilliseconds % 3_600_000) / 60_000
    let wholeSeconds = (totalMilliseconds % 60_000) / 1_000
    let milliseconds = totalMilliseconds % 1_000
    return String(format: "%02d:%02d:%02d,%03d", hours, minutes, wholeSeconds, milliseconds)
}

func writeSubtitles(scenes: [Scene], renderedScenes: [RenderedScene], outputURL: URL) throws {
    var cursor = 0.0
    var blocks: [String] = []
    for (offset, pair) in zip(scenes, renderedScenes).enumerated() {
        let start = cursor + narrationLeadIn
        let end = start + pair.1.narrationDuration
        blocks.append("\(offset + 1)\n\(srtTimestamp(start)) --> \(srtTimestamp(end))\n\(pair.0.narration)")
        cursor += pair.1.duration
    }
    let content = "\u{FEFF}" + blocks.joined(separator: "\n\n") + "\n"
    try content.write(to: outputURL, atomically: true, encoding: .utf8)
}

func writeNarrationScript(title: String, version: String, scenes: [Scene], renderedScenes: [RenderedScene], outputURL: URL) throws {
    var cursor = 0.0
    var sections = ["# \(title) 旁白稿", "", "版本：v\(version)", ""]
    for (offset, pair) in zip(scenes, renderedScenes).enumerated() {
        let start = cursor + narrationLeadIn
        let end = start + pair.1.narrationDuration
        sections.append("## \(offset + 1). \(pair.0.title)")
        sections.append("")
        sections.append("时间：\(srtTimestamp(start)) → \(srtTimestamp(end))")
        sections.append("")
        sections.append(pair.0.narration)
        sections.append("")
        cursor += pair.1.duration
    }
    try sections.joined(separator: "\n").write(to: outputURL, atomically: true, encoding: .utf8)
}

func writeVideoPreview(videoURL: URL, outputURL: URL, at seconds: Double) throws {
    if fileManager.fileExists(atPath: outputURL.path) { try fileManager.removeItem(at: outputURL) }
    let asset = AVURLAsset(url: videoURL)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    var actualTime = CMTime.zero
    let image = try generator.copyCGImage(at: CMTime(seconds: seconds, preferredTimescale: 600), actualTime: &actualTime)
    guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, "public.png" as CFString, 1, nil) else {
        throw TourError.imageRenderFailed("无法创建视频预览图：\(outputURL.path)")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw TourError.imageRenderFailed("无法写入视频预览图：\(outputURL.path)")
    }
}

do {
    guard CommandLine.arguments.count == 2 else { throw TourError.invalidArguments }
    let manifestURL = rootURL.appendingPathComponent(CommandLine.arguments[1])
    let manifest = try readJSON(TourManifest.self, from: manifestURL)
    let packageInfo = try readJSON(PackageInfo.self, from: rootURL.appendingPathComponent("package.json"))
    let outputName = manifest.outputName ?? "MES-lite主界面导览"
    let contentVersion = manifest.contentVersion ?? packageInfo.version
    let outputStem = "\(outputName)-v\(contentVersion)"
    let usesLegacyMainInterfaceNames = manifest.outputName == nil
    let outputURL = rootURL.appendingPathComponent("output/tutorials/\(outputStem)", isDirectory: true)
    let buildURL = outputURL.appendingPathComponent(".build", isDirectory: true)
    if fileManager.fileExists(atPath: buildURL.path) { try fileManager.removeItem(at: buildURL) }
    let slidesURL = buildURL.appendingPathComponent("slides", isDirectory: true)
    let audioURL = buildURL.appendingPathComponent("audio", isDirectory: true)
    try fileManager.createDirectory(at: slidesURL, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: audioURL, withIntermediateDirectories: true)

    var renderedScenes: [RenderedScene] = []
    for (offset, scene) in manifest.scenes.enumerated() {
        let index = offset + 1
        let stem = String(format: "%02d", index)
        let sourceURL = rootURL.appendingPathComponent(scene.sourceImage)
        guard fileManager.fileExists(atPath: sourceURL.path) else { throw TourError.missingFile(sourceURL.path) }
        let slideURL = slidesURL.appendingPathComponent("\(stem).png")
        let cleanSlideURL = slidesURL.appendingPathComponent("\(stem)-clean.png")
        let narrationURL = audioURL.appendingPathComponent("\(stem).aiff")
        try renderSlide(scene: scene, sourceURL: sourceURL, destinationURL: slideURL, version: contentVersion, showNarration: true)
        try renderSlide(scene: scene, sourceURL: sourceURL, destinationURL: cleanSlideURL, version: contentVersion, showNarration: false)
        if fileManager.fileExists(atPath: narrationURL.path) { try fileManager.removeItem(at: narrationURL) }
        _ = try runCommand("/usr/bin/say", ["-v", manifest.voice, "-r", String(manifest.speechRate), "-o", narrationURL.path, scene.narration])
        let narrationDuration = try estimatedAudioDuration(at: narrationURL)
        let duration = max(5.5, narrationDuration + scenePadding)
        renderedScenes.append(RenderedScene(index: index, title: scene.title, slide: slideURL.path, cleanSlide: cleanSlideURL.path, audio: narrationURL.path, narrationDuration: narrationDuration, duration: duration))
        print("[\(index)/\(manifest.scenes.count)] \(scene.title) · \(String(format: "%.1f", duration)) 秒")
    }

    let timeline = RenderedTimeline(version: contentVersion, width: canvasWidth, height: canvasHeight, fps: Int(framesPerSecond), scenes: renderedScenes)
    let timelineURL = buildURL.appendingPathComponent("timeline.json")
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    try encoder.encode(timeline).write(to: timelineURL)

    let silentVideoURL = buildURL.appendingPathComponent("silent.mov")
    let finalVideoURL = outputURL.appendingPathComponent(usesLegacyMainInterfaceNames ? "\(outputStem)-全同步版.mp4" : "\(outputStem)-配音字幕预览.mp4")
    let dubbingVideoURL = outputURL.appendingPathComponent(usesLegacyMainInterfaceNames ? "\(outputStem)-剪映配音底版.mp4" : "\(outputStem)-无配音母版.mp4")
    let previewURL = outputURL.appendingPathComponent("\(outputStem)-preview.png")
    let navigationSettingsPreviewURL = buildURL.appendingPathComponent("navigation-settings-preview.png")
    let navigationSettingsBeforeSpeechPreviewURL = buildURL.appendingPathComponent("navigation-settings-before-speech.png")
    let navigationSettingsAfterSpeechPreviewURL = buildURL.appendingPathComponent("navigation-settings-after-speech.png")
    let subtitleURL = outputURL.appendingPathComponent(usesLegacyMainInterfaceNames ? "\(outputStem)-全同步版.srt" : "\(outputStem).srt")
    let narrationScriptURL = outputURL.appendingPathComponent("\(outputStem)-旁白稿.md")
    try writeSilentVideo(scenes: renderedScenes, to: silentVideoURL, includeNarrationCaptions: true)
    try combineVideoAndNarration(scenes: renderedScenes, silentVideoURL: silentVideoURL, outputURL: finalVideoURL)
    try writeSilentVideo(scenes: renderedScenes, to: dubbingVideoURL, includeNarrationCaptions: false)
    try writeSubtitles(scenes: manifest.scenes, renderedScenes: renderedScenes, outputURL: subtitleURL)
    try writeNarrationScript(title: manifest.title, version: contentVersion, scenes: manifest.scenes, renderedScenes: renderedScenes, outputURL: narrationScriptURL)
    try writeVideoPreview(videoURL: finalVideoURL, outputURL: previewURL, at: 2)
    if usesLegacyMainInterfaceNames && renderedScenes.count > 6 {
        let navigationSettingsStart = renderedScenes.prefix(6).reduce(0) { $0 + $1.duration }
        let navigationSettingsScene = renderedScenes[6]
        try writeVideoPreview(videoURL: finalVideoURL, outputURL: navigationSettingsBeforeSpeechPreviewURL, at: navigationSettingsStart + 0.2)
        try writeVideoPreview(videoURL: finalVideoURL, outputURL: navigationSettingsPreviewURL, at: navigationSettingsStart + 2)
        try writeVideoPreview(
            videoURL: finalVideoURL,
            outputURL: navigationSettingsAfterSpeechPreviewURL,
            at: navigationSettingsStart + narrationLeadIn + navigationSettingsScene.narrationDuration + 0.2
        )
    }
    let totalDuration = renderedScenes.reduce(0) { $0 + $1.duration }
    let legacyNames = [
        "MES-lite主界面导览-v\(contentVersion).mp4",
        "MES-lite主界面导览-v\(contentVersion).srt",
        "MES-lite主界面导览-v\(contentVersion)-preview.png",
        "MES-lite主界面导览-v\(contentVersion)-navigation-settings-preview.png",
        "MES-lite主界面导览-v\(contentVersion)-navigation-settings-before-speech.png",
        "MES-lite主界面导览-v\(contentVersion)-navigation-settings-after-speech.png",
        "MES-lite主界面导览-v\(contentVersion)-方向修正版.mp4",
        "MES-lite主界面导览-v\(contentVersion)-无遮挡修正版.mp4",
        "MES-lite主界面导览-v\(contentVersion)-全同步修正版.mp4",
        "MES-lite主界面导览-v\(contentVersion)-全同步修正版.srt",
        "timeline.json",
        "audio",
        "slides",
        "voice-samples",
    ]
    for name in legacyNames {
        let legacyURL = outputURL.appendingPathComponent(name)
        if fileManager.fileExists(atPath: legacyURL.path) { try fileManager.removeItem(at: legacyURL) }
    }
    if fileManager.fileExists(atPath: buildURL.path) { try fileManager.removeItem(at: buildURL) }

    print("已生成：\(finalVideoURL.path)")
    print("无配音母版：\(dubbingVideoURL.path)")
    print("字幕文件：\(subtitleURL.path)")
    print("旁白稿：\(narrationScriptURL.path)")
    print("已完成最终视频抽帧检查并清理中间文件")
    print("规格：1920×1080 / H.264 MP4 / 中文旁白 / 烧录字幕 / \(String(format: "%.1f", totalDuration)) 秒")
} catch {
    FileHandle.standardError.write(Data("生成失败：\(error)\n".utf8))
    exit(1)
}
