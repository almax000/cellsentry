// cellsentry-docreader: reads PDFs and photos into plain text, entirely on this Mac.
//
// Usage: cellsentry-docreader <file>...
//        cellsentry-docreader --text-only -- <file>...
//
// --text-only reads text layers only and never runs text recognition (OCR): photos and scanned
// pages are reported as needs_ocr, and a page with both a text layer and a picture keeps its text
// and is reported too. Options are read only before a literal "--"; without one, every argument is
// a file.
//
// Writes one JSON object per line to stdout (UTF-8), flushed after every line:
//   {"type":"start","file":0,"path":"...","kind":"pdf"|"image","pages":N}
//   {"type":"page","file":0,"page":1,"pages":N,"source":"text"|"ocr","text":"..."}
//   {"type":"error","file":0,"page":1,"code":"...","message":"..."}   ("page" omitted for file-level errors)
//   {"type":"end","file":0}
//   {"type":"done"}
//
// Privacy contract: no network access, no files or temporary files written, and
// document text never goes to stderr. Exit code 2 only for usage errors, 0 otherwise
// (1 only if stdout itself breaks, when nobody is left to read the result).

import CoreGraphics
import Foundation
import ImageIO
import PDFKit
import Vision

let maxPdfPages = 200
let minTextLayerCharacters = 16
let mixedPageTextLimit = 200 // Pages that draw an image and carry less text than this are OCRed too.
let pdfRenderScale: CGFloat = 2
let pdfMaxRenderSide: CGFloat = 3000
let imageMaxSide = 4096
let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "tiff", "tif", "bmp", "webp"]
// Larger images are refused before decoding instead of risking the reader running out of memory,
// and so is an image whose size cannot be read. 100 MP is twice a 48 MP phone photo.
let maxImagePixels = 100_000_000
let maxImageDecodeBytes = 800_000_000
// A page's text layer longer than this many Unicode scalars is cut there and the rest of the file is
// not read: no real report comes close, and a crafted PDF could otherwise expand to gigabytes of text.
// Scalars, not Characters: one Character can hold any number of combining marks. At this size an
// output line stays far below the wrapper's line limit even when every scalar needs a \u escape.
let maxPageScalars = 2_000_000

enum ErrorCode: String {
    case unreadable
    case encrypted
    case restricted
    case tooLarge = "too_large"
    case unsupported
    case ocrFailed = "ocr_failed"
    case tooManyPages = "too_many_pages"
    case tooMuchText = "too_much_text"
    case needsOcr = "needs_ocr"
}

/// False with --text-only: Vision text recognition is never used.
var ocrEnabled = true

// MARK: - JSON Lines output

enum JSONField {
    case string(String)
    case int(Int)
}

func jsonQuoted(_ value: String) -> String {
    var out = "\""
    out.reserveCapacity(value.utf8.count + 2)
    for scalar in value.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if scalar.value < 0x20 || scalar.value == 0x7F || scalar.value == 0x2028 || scalar.value == 0x2029 {
                out += String(format: "\\u%04X", scalar.value)
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
    }
    out += "\""
    return out
}

func writeStdout(_ line: String) {
    let bytes = Array(line.utf8)
    var offset = 0
    while offset < bytes.count {
        let written = bytes.withUnsafeBytes { buffer in
            Darwin.write(STDOUT_FILENO, buffer.baseAddress! + offset, buffer.count - offset)
        }
        if written < 0 {
            if errno == EINTR { continue }
            exit(1) // Nobody is listening any more; there is no one left to report to.
        }
        offset += written
    }
}

func emit(_ fields: [(String, JSONField)]) {
    var line = "{"
    for (index, (key, value)) in fields.enumerated() {
        if index > 0 { line += "," }
        line += jsonQuoted(key) + ":"
        switch value {
        case .string(let text): line += jsonQuoted(text)
        case .int(let number): line += String(number)
        }
    }
    line += "}\n"
    writeStdout(line)
}

func emitStart(file: Int, path: String, kind: String, pages: Int) {
    emit([("type", .string("start")), ("file", .int(file)), ("path", .string(path)),
          ("kind", .string(kind)), ("pages", .int(pages))])
}

func emitPage(file: Int, page: Int, pages: Int, source: String, text: String) {
    emit([("type", .string("page")), ("file", .int(file)), ("page", .int(page)), ("pages", .int(pages)),
          ("source", .string(source)), ("text", .string(text))])
}

func emitError(file: Int, page: Int?, code: ErrorCode, message: String) {
    var fields: [(String, JSONField)] = [("type", .string("error")), ("file", .int(file))]
    if let page { fields.append(("page", .int(page))) }
    fields.append(("code", .string(code.rawValue)))
    fields.append(("message", .string(message)))
    emit(fields)
}

func emitEnd(file: Int) {
    emit([("type", .string("end")), ("file", .int(file))])
}

// MARK: - Text helpers

func normalizeText(_ text: String) -> String {
    text.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .replacingOccurrences(of: "\u{0}", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Characters that carry meaning: not whitespace, not U+FFFD, not private-use or control.
/// Fonts without a ToUnicode map often extract as replacement or private-use characters.
func usableCharacterCount(_ text: String) -> (nonWhitespace: Int, usable: Int) {
    var nonWhitespace = 0
    var usable = 0
    for character in text where !character.isWhitespace {
        nonWhitespace += 1
        guard let scalar = character.unicodeScalars.first else { continue }
        let value = scalar.value
        let garbage = value == 0xFFFD || (0xE000...0xF8FF).contains(value) || value < 0x20
            || (0xF0000...0x10FFFF).contains(value)
        if !garbage { usable += 1 }
    }
    return (nonWhitespace, usable)
}

/// True when the page (or a form it draws, a few levels deep) paints an image XObject.
/// A page without its own /Resources inherits them from its parents in the page tree.
/// Every form is looked at once, so a file whose forms all draw each other stays fast.
func drawsImages(_ page: CGPDFPage) -> Bool {
    var seen = Set<OpaquePointer>()
    func search(_ resources: CGPDFDictionaryRef, depth: Int) -> Bool {
        var xObjects: CGPDFDictionaryRef?
        guard CGPDFDictionaryGetDictionary(resources, "XObject", &xObjects), let xObjects else { return false }
        var found = false
        CGPDFDictionaryApplyBlock(xObjects, { _, object, _ in
            var stream: CGPDFStreamRef?
            var subtype: UnsafePointer<CChar>?
            guard CGPDFObjectGetValue(object, .stream, &stream), let stream,
                  let streamDictionary = CGPDFStreamGetDictionary(stream),
                  CGPDFDictionaryGetName(streamDictionary, "Subtype", &subtype), let subtype else { return true }
            switch String(cString: subtype) {
            case "Image":
                found = true
            case "Form" where depth < 3:
                guard seen.insert(streamDictionary.rawValue).inserted else { return true }
                var nested: CGPDFDictionaryRef?
                if CGPDFDictionaryGetDictionary(streamDictionary, "Resources", &nested), let nested {
                    found = search(nested, depth: depth + 1)
                }
            default:
                break
            }
            return !found
        }, nil)
        return found
    }
    var node = page.dictionary
    var parents = Set<OpaquePointer>()
    for _ in 0..<8 {
        guard let current = node, parents.insert(current.rawValue).inserted else { return false }
        var resources: CGPDFDictionaryRef?
        if CGPDFDictionaryGetDictionary(current, "Resources", &resources), let resources {
            return search(resources, depth: 0)
        }
        var parent: CGPDFDictionaryRef?
        node = CGPDFDictionaryGetDictionary(current, "Parent", &parent) ? parent : nil
    }
    return false
}

func needsOCR(_ textLayer: String) -> Bool {
    let counts = usableCharacterCount(textLayer)
    if counts.usable < minTextLayerCharacters { return true }
    return counts.usable * 2 < counts.nonWhitespace
}

// MARK: - Vision OCR with layout reconstruction

struct TextBox {
    let text: String
    let rect: CGRect // Pixel units in the upright text frame, y grows upwards.
}

struct RecognizedLine {
    let text: String
    let corners: [CGPoint] // bottomLeft, bottomRight, topRight, topLeft in pixels, y up.
}

func degrees(_ value: CGFloat) -> CGFloat {
    let wrapped = value.truncatingRemainder(dividingBy: 360)
    return wrapped < 0 ? wrapped + 360 : wrapped
}

/// Vision reads sideways or slightly skewed text but reports boxes in image axes, which would
/// turn columns into lines. Rotate every box by the dominant baseline direction (the quarter
/// turn carrying most characters plus their weighted-median skew) before grouping lines.
func uprightBoxes(_ lines: [RecognizedLine]) -> [TextBox] {
    guard !lines.isEmpty else { return [] }
    let measured = lines.map { line -> (angle: CGFloat, weight: CGFloat) in
        let baseline = CGPoint(x: line.corners[1].x - line.corners[0].x, y: line.corners[1].y - line.corners[0].y)
        return (degrees(atan2(baseline.y, baseline.x) * 180 / .pi), CGFloat(max(1, line.text.count)))
    }
    var quarterWeights = [CGFloat](repeating: 0, count: 4)
    for item in measured { quarterWeights[Int((item.angle + 45) / 90) % 4] += item.weight }
    let quarter = quarterWeights.indices.max { quarterWeights[$0] < quarterWeights[$1] } ?? 0
    let residuals = measured
        .filter { Int(($0.angle + 45) / 90) % 4 == quarter }
        .map { item -> (skew: CGFloat, weight: CGFloat) in
            var skew = item.angle - CGFloat(quarter * 90)
            if skew > 180 { skew -= 360 }
            return (skew, item.weight)
        }
        .sorted { $0.skew < $1.skew }
    let half = residuals.reduce(0) { $0 + $1.weight } / 2
    var accumulated: CGFloat = 0
    var skew: CGFloat = 0
    for item in residuals {
        accumulated += item.weight
        if accumulated >= half { skew = item.skew; break }
    }
    let radians = -(CGFloat(quarter * 90) + skew) * .pi / 180
    let (cosine, sine) = (cos(radians), sin(radians))
    return lines.map { line in
        let turned = line.corners.map { CGPoint(x: $0.x * cosine - $0.y * sine, y: $0.x * sine + $0.y * cosine) }
        let xs = turned.map(\.x), ys = turned.map(\.y)
        return TextBox(text: line.text, rect: CGRect(x: xs.min()!, y: ys.min()!,
                                                     width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!))
    }
}

func verticalOverlapRatio(_ a: CGRect, _ b: CGRect) -> CGFloat {
    let height = min(a.height, b.height)
    guard height > 0 else { return 0 }
    let overlap = min(a.maxY, b.maxY) - max(a.minY, b.minY)
    return max(0, overlap) / height
}

func horizontalGap(_ a: CGRect, _ b: CGRect) -> CGFloat {
    max(0, max(a.minX, b.minX) - min(a.maxX, b.maxX))
}

/// Groups boxes into lines (vertical overlap above half the smaller height, measured against
/// the horizontally nearest box already on the line so slightly skewed photos still group),
/// orders lines top to bottom and boxes left to right, joins boxes with two spaces.
func layoutText(_ boxes: [TextBox]) -> String {
    let ordered = boxes.sorted {
        $0.rect.midY != $1.rect.midY ? $0.rect.midY > $1.rect.midY : $0.rect.minX < $1.rect.minX
    }
    var lines: [[TextBox]] = []
    for box in ordered {
        var best: (line: Int, score: CGFloat)?
        for (index, line) in lines.enumerated() {
            guard let neighbor = line.min(by: { horizontalGap($0.rect, box.rect) < horizontalGap($1.rect, box.rect) })
            else { continue }
            let score = verticalOverlapRatio(neighbor.rect, box.rect)
            if score > 0.5 && (best == nil || score > best!.score) { best = (index, score) }
        }
        if let best { lines[best.line].append(box) } else { lines.append([box]) }
    }
    func center(_ line: [TextBox]) -> CGFloat {
        line.reduce(0) { $0 + $1.rect.midY } / CGFloat(line.count)
    }
    return lines
        .sorted { center($0) > center($1) }
        .map { line in line.sorted { $0.rect.minX < $1.rect.minX }.map(\.text).joined(separator: "  ") }
        .joined(separator: "\n")
}

/// One Vision result mapped into whole-image normalized coordinates (origin bottom-left).
struct Observation {
    let text: String
    let corners: [CGPoint] // bottomLeft, bottomRight, topRight, topLeft
    let bounds: CGRect
    let touchesSeam: Bool  // Touches an inner edge of its tile, so the text may be cut off.
}

let wholeImage = CGRect(x: 0, y: 0, width: 1, height: 1)
// 2 x 2 tiles overlapping by a fifth of the image in each direction.
let tiles: [CGRect] = [0.0, 0.4].flatMap { y in [0.0, 0.4].map { x in CGRect(x: x, y: y, width: 0.6, height: 0.6) } }
// Second fallback: five full-width bands overlapping by a quarter of their height.
let strips: [CGRect] = [0.0, 0.1875, 0.375, 0.5625, 0.75].map { CGRect(x: 0, y: $0, width: 1, height: 0.25) }

func observe(_ image: CGImage, region: CGRect, accurate: Bool) throws -> [Observation] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = accurate ? .accurate : .fast
    request.recognitionLanguages = accurate ? ["zh-Hans", "en-US"] : ["en-US"]
    request.usesLanguageCorrection = accurate
    request.regionOfInterest = region
    try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
    let seam: CGFloat = 0.005
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        // Results are normalized to the region of interest.
        func whole(_ point: CGPoint) -> CGPoint {
            CGPoint(x: region.minX + point.x * region.width, y: region.minY + point.y * region.height)
        }
        let local = observation.boundingBox
        let touchesSeam = (region.minX > 0 && local.minX < seam) || (region.maxX < 1 && local.maxX > 1 - seam)
            || (region.minY > 0 && local.minY < seam) || (region.maxY < 1 && local.maxY > 1 - seam)
        let corners = [observation.bottomLeft, observation.bottomRight, observation.topRight, observation.topLeft]
        let origin = whole(local.origin)
        return Observation(text: text, corners: corners.map(whole),
                           bounds: CGRect(x: origin.x, y: origin.y, width: local.width * region.width,
                                          height: local.height * region.height),
                           touchesSeam: touchesSeam)
    }
}

func intersectionArea(_ a: CGRect, _ b: CGRect) -> CGFloat {
    let overlap = a.intersection(b)
    return overlap.isNull ? 0 : overlap.width * overlap.height
}

/// Adds observations that do not substantially overlap anything already kept.
func merge(_ kept: inout [Observation], _ extra: [Observation]) {
    for item in extra {
        let area = item.bounds.width * item.bounds.height
        let duplicate = kept.contains {
            intersectionArea($0.bounds, item.bounds) > 0.3 * min(area, $0.bounds.width * $0.bounds.height)
        }
        if !duplicate { kept.append(item) }
    }
}

/// Accurate recognition of a whole page sometimes silently drops entire table columns (measured on
/// synthetic lab-result tables). The fast recognizer still finds where text is, so while it sees text
/// that the accurate results leave uncovered, the page is read again in overlapping regions (2 x 2
/// tiles, then horizontal bands) and new boxes are merged in. Fallback passes are best effort.
func recognizeText(in image: CGImage) throws -> String {
    var kept = try observe(image, region: wholeImage, accurate: true)
    let detected = (try? observe(image, region: wholeImage, accurate: false)) ?? []
    func missed() -> Bool {
        detected.contains { probe in
            guard probe.text.count >= 2 else { return false }
            let area = probe.bounds.width * probe.bounds.height
            let covered = kept.reduce(0) { $0 + intersectionArea($1.bounds, probe.bounds) }
            return area > 0 && covered < 0.5 * area
        }
    }
    for layout in [tiles, strips] where missed() {
        let tiled = layout.flatMap { (try? observe(image, region: $0, accurate: true)) ?? [] }
        merge(&kept, tiled.filter { !$0.touchesSeam } + tiled.filter(\.touchesSeam))
    }
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let lines = kept.map { observation in
        RecognizedLine(text: observation.text,
                       corners: observation.corners.map { CGPoint(x: $0.x * width, y: $0.y * height) })
    }
    return layoutText(uprightBoxes(lines))
}

// MARK: - Bitmaps

func makeOpaqueContext(width: Int, height: Int) -> CGContext? {
    guard width > 0, height > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { return nil }
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high
    return context
}

/// Renders a PDF page at 2x (long side capped at 3000 px) on white, honouring /Rotate and the crop box.
func renderPage(_ page: CGPDFPage) -> CGImage? {
    let box = page.getBoxRect(.cropBox)
    guard box.width > 0, box.height > 0 else { return nil }
    let rotation = ((Int(page.rotationAngle) % 360) + 360) % 360
    let quarterTurn = rotation == 90 || rotation == 270
    let width = quarterTurn ? box.height : box.width
    let height = quarterTurn ? box.width : box.height
    let scale = min(pdfRenderScale, pdfMaxRenderSide / max(width, height))
    let pixelWidth = max(1, Int((width * scale).rounded()))
    let pixelHeight = max(1, Int((height * scale).rounded()))
    guard let context = makeOpaqueContext(width: pixelWidth, height: pixelHeight) else { return nil }
    context.scaleBy(x: CGFloat(pixelWidth) / width, y: CGFloat(pixelHeight) / height)
    let target = CGRect(x: 0, y: 0, width: width, height: height)
    context.concatenate(page.getDrawingTransform(.cropBox, rect: target, rotate: 0, preserveAspectRatio: true))
    context.clip(to: box)
    context.drawPDFPage(page)
    return context.makeImage()
}

/// Transparent pixels would otherwise reach Vision as black; flatten such images onto white.
func flattenedOnWhite(_ image: CGImage) -> CGImage? {
    switch image.alphaInfo {
    case .none, .noneSkipFirst, .noneSkipLast: return image
    default: break
    }
    guard let context = makeOpaqueContext(width: image.width, height: image.height) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return context.makeImage()
}

// MARK: - Readers

func readPDF(file: Int, path: String, url: URL) {
    guard let cgDocument = CGPDFDocument(url as CFURL) else {
        emitError(file: file, page: nil, code: .unreadable, message: "File is not a readable PDF.")
        return
    }
    if cgDocument.isEncrypted && !cgDocument.isUnlocked {
        emitError(file: file, page: nil, code: .encrypted, message: "PDF is password protected.")
        return
    }
    // Opens without a password but has restrictions: read it only if copying its text is allowed.
    if cgDocument.isEncrypted && !cgDocument.allowsCopying {
        emitError(file: file, page: nil, code: .restricted, message: "PDF does not allow copying its text.")
        return
    }
    guard let document = PDFDocument(url: url) else {
        emitError(file: file, page: nil, code: .unreadable, message: "File is not a readable PDF.")
        return
    }
    if document.isLocked {
        emitError(file: file, page: nil, code: .encrypted, message: "PDF is password protected.")
        return
    }
    if document.isEncrypted && !document.allowsCopying {
        emitError(file: file, page: nil, code: .restricted, message: "PDF does not allow copying its text.")
        return
    }
    let total = document.pageCount
    guard total > 0 else {
        emitError(file: file, page: nil, code: .unreadable, message: "PDF has no readable pages.")
        return
    }
    emitStart(file: file, path: path, kind: "pdf", pages: total)
    var stopped = false
    for index in 0..<min(total, maxPdfPages) where !stopped {
        autoreleasepool {
            let pageNumber = index + 1
            // Cut before normalizing, so an oversized page is never copied whole.
            let raw = document.page(at: index)?.string ?? ""
            let oversized = raw.unicodeScalars.count > maxPageScalars
            var limited = String.UnicodeScalarView()
            if oversized { limited.append(contentsOf: raw.unicodeScalars.prefix(maxPageScalars)) }
            let textLayer = normalizeText(oversized ? String(limited) : raw)
            if oversized {
                emitPage(file: file, page: pageNumber, pages: total, source: "text", text: textLayer)
                emitError(file: file, page: pageNumber, code: .tooMuchText,
                          message: "Page has too much text; the rest of the file was not read.")
                stopped = true
                return
            }
            let layerCharacters = usableCharacterCount(textLayer).usable
            let cgPage = cgDocument.page(at: pageNumber)
            let scanned = needsOCR(textLayer)
            // A scan with a short typed header or footer passes the 16-character test but is still a scan.
            let mixed = !scanned && layerCharacters < mixedPageTextLimit && cgPage.map(drawsImages) == true
            guard scanned || mixed else {
                emitPage(file: file, page: pageNumber, pages: total, source: "text", text: textLayer)
                return
            }
            guard ocrEnabled else {
                // Without recognition: a page with no picture (a blank page, a short signature line) is all there
                // is, so its text is read as is. Only a picture, or a text layer that does not decode, is reported.
                let counts = usableCharacterCount(textLayer)
                let garbled = counts.usable * 2 < counts.nonWhitespace
                let picture = cgPage.map(drawsImages) == true
                if !garbled && (counts.usable > 0 || !picture) {
                    emitPage(file: file, page: pageNumber, pages: total, source: "text", text: textLayer)
                }
                if garbled {
                    emitError(file: file, page: pageNumber, code: .needsOcr, message: "Page text cannot be decoded and needs text recognition.")
                } else if picture {
                    emitError(file: file, page: pageNumber, code: .needsOcr, message: counts.usable > 0
                              ? "Page also holds a scanned picture, which was not read."
                              : "Page is scanned and needs text recognition.")
                }
                return
            }
            var failure = "Page could not be rendered for text recognition."
            var recognized: String?
            if let cgPage, let image = renderPage(cgPage) {
                recognized = try? recognizeText(in: image)
                failure = "Text recognition failed."
            }
            // Keep the text layer when OCR fails on a mixed page or reads less than the layer holds.
            guard let recognized, usableCharacterCount(recognized).usable >= layerCharacters else {
                if recognized != nil || mixed {
                    emitPage(file: file, page: pageNumber, pages: total, source: "text", text: textLayer)
                } else {
                    emitError(file: file, page: pageNumber, code: .ocrFailed, message: failure)
                }
                return
            }
            emitPage(file: file, page: pageNumber, pages: total, source: "ocr", text: recognized)
        }
    }
    if total > maxPdfPages && !stopped {
        emitError(file: file, page: nil, code: .tooManyPages,
                  message: "PDF has \(total) pages; only the first \(maxPdfPages) were read.")
    }
}

/// Why an image frame may not be decoded, or nil when it may. Unknown sizes are refused too.
func imageFrameProblem(_ source: CGImageSource, _ index: Int) -> (ErrorCode, String)? {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0 else {
        return (.unreadable, "Image size could not be read.")
    }
    let (pixels, overflow) = width.multipliedReportingOverflow(by: height)
    // Four channels at the stored bit depth, at least one byte each: what decoding may need.
    let depth = max(8, min(64, properties[kCGImagePropertyDepth] as? Int ?? 8))
    let bytesPerPixel = 4 * ((depth + 7) / 8)
    if overflow || pixels > maxImagePixels || pixels > maxImageDecodeBytes / bytesPerPixel {
        return (.tooLarge, "Image is too large.")
    }
    return nil
}

/// Photos are one page; a multi-page TIFF (a fax or a scanner's output) is read page by page.
func readImage(file: Int, path: String, url: URL) {
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions), CGImageSourceGetCount(source) > 0 else {
        emitError(file: file, page: nil, code: .unreadable, message: "File is not a readable image.")
        return
    }
    let thumbnailOptions: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: imageMaxSide,
        kCGImageSourceShouldCacheImmediately: true,
    ]
    let isTIFF = ["tif", "tiff"].contains(url.pathExtension.lowercased())
    let frames = isTIFF ? Array(0..<CGImageSourceGetCount(source)) : [CGImageSourceGetPrimaryImageIndex(source)]
    let total = frames.count
    // Checked before anything is decoded, so a file is refused whole rather than half read.
    for index in frames.prefix(maxPdfPages) {
        if let (code, message) = imageFrameProblem(source, index) {
            emitError(file: file, page: nil, code: code, message: message)
            return
        }
    }
    emitStart(file: file, path: path, kind: "image", pages: total)
    for (position, index) in frames.prefix(maxPdfPages).enumerated() {
        autoreleasepool {
            let pageNumber = position + 1
            guard let decoded = CGImageSourceCreateThumbnailAtIndex(source, index, thumbnailOptions as CFDictionary),
                  let image = flattenedOnWhite(decoded) else {
                emitError(file: file, page: total > 1 ? pageNumber : nil, code: .unreadable, message: "Image could not be decoded.")
                return
            }
            do {
                emitPage(file: file, page: pageNumber, pages: total, source: "ocr", text: try recognizeText(in: image))
            } catch {
                emitError(file: file, page: pageNumber, code: .ocrFailed, message: "Text recognition failed.")
            }
        }
    }
    if total > maxPdfPages {
        emitError(file: file, page: nil, code: .tooManyPages,
                  message: "Image has \(total) pages; only the first \(maxPdfPages) were read.")
    }
}

func readFile(file: Int, path: String) {
    let url = URL(fileURLWithPath: path)
    let fileExtension = url.pathExtension.lowercased()
    let isPDF = fileExtension == "pdf"
    guard isPDF || imageExtensions.contains(fileExtension) else {
        emitError(file: file, page: nil, code: .unsupported, message: "File type is not supported.")
        return
    }
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue,
          FileManager.default.isReadableFile(atPath: url.path) else {
        emitError(file: file, page: nil, code: .unreadable, message: "File does not exist or cannot be opened.")
        return
    }
    if isPDF {
        readPDF(file: file, path: path, url: url)
    } else if ocrEnabled {
        readImage(file: file, path: path, url: url)
    } else {
        emitError(file: file, page: nil, code: .needsOcr, message: "Photos need text recognition, which is turned off.")
    }
}

// MARK: - Entry point

signal(SIGPIPE, SIG_IGN)
func usageError() -> Never {
    FileHandle.standardError.write(Data("usage: cellsentry-docreader [--text-only --] <file>...\n".utf8))
    exit(2)
}
var files = Array(CommandLine.arguments.dropFirst())
if let separator = files.firstIndex(of: "--") {
    for option in files[..<separator] {
        guard option == "--text-only" else { usageError() }
        ocrEnabled = false
    }
    files = Array(files[(separator + 1)...])
}
if files.isEmpty { usageError() }
for (index, path) in files.enumerated() {
    autoreleasepool { readFile(file: index, path: path) }
    emitEnd(file: index)
}
emit([("type", .string("done"))])
exit(0)
