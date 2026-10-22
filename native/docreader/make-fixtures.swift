// Test-only: writes synthetic, obviously fictional sample documents for cellsentry-docreader.
// Usage: make-fixtures <empty output directory>
//
//   text.pdf        PDF with a real text layer
//   scanned.pdf     PDF whose only content is a picture of the same page (no text layer)
//   scanned-rotated.pdf  the scanned page with /Rotate 90
//   scanned-footer.pdf   the scanned page plus a short typed footer in a real text layer
//   photo.png       picture of a form on paper-grey background
//   photo.heic      photo.png converted with the system `sips` tool
//   rotated.jpg     photo stored sideways with EXIF orientation 6 (must be turned upright)
//   sideways.png    the same sideways pixels without any orientation tag
//   skewed.png      photo turned 4 degrees, like a hand-held shot
//   locked.pdf      PDF with a user password
//   restricted.pdf  PDF with only an owner password (no copying)
//   print-locked.pdf  PDF with only an owner password that forbids printing but allows copying
//   two-pages.tiff  a two-page TIFF (the photo, then the scan), like a scanner's output
//   short-pages.pdf  a text PDF: the report, a page with one short typed line, and a blank page
//   many-pages.pdf  201 pages with text layers
//   broken.pdf, broken.png, notes.docx  damaged and unsupported inputs
//
// Every value is invented test data; nothing here describes a real person.

import CoreGraphics
import CoreText
import Foundation
import ImageIO
import PDFKit

let pageWidth: CGFloat = 595
let pageHeight: CGFloat = 842

struct Label {
    let text: String
    let x: CGFloat
    let top: CGFloat
    let size: CGFloat
}

let report: [Label] = [
    Label(text: "体检报告（虚构测试样例）", x: 170, top: 60, size: 20),
    Label(text: "姓名：测试甲", x: 60, top: 130, size: 14),
    Label(text: "性别：男", x: 260, top: 130, size: 14),
    Label(text: "年龄：35", x: 420, top: 130, size: 14),
    Label(text: "电话：13800000000", x: 60, top: 165, size: 14),
    Label(text: "编号：TEST-0001", x: 330, top: 165, size: 14),
    Label(text: "项目", x: 60, top: 230, size: 13),
    Label(text: "结果", x: 260, top: 230, size: 13),
    Label(text: "单位", x: 400, top: 230, size: 13),
    Label(text: "总胆固醇", x: 60, top: 262, size: 13),
    Label(text: "5.6", x: 260, top: 262, size: 13),
    Label(text: "mmol/L", x: 400, top: 262, size: 13),
    Label(text: "甘油三酯", x: 60, top: 294, size: 13),
    Label(text: "1.2", x: 260, top: 294, size: 13),
    Label(text: "mmol/L", x: 400, top: 294, size: 13),
    Label(text: "备注：本页内容均为虚构测试数据", x: 60, top: 360, size: 9),
]

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("make-fixtures: \(message)\n".utf8))
    exit(1)
}

func draw(_ labels: [Label], in context: CGContext) {
    context.textMatrix = .identity
    for label in labels {
        let font = CTFontCreateWithName("PingFangSC-Regular" as CFString, label.size, nil)
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1),
        ]
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: label.text, attributes: attributes))
        context.textPosition = CGPoint(x: label.x, y: pageHeight - label.top - label.size)
        CTLineDraw(line, context)
    }
}

func bitmap(scale: CGFloat, background: CGFloat) -> CGImage {
    let width = Int(pageWidth * scale), height = Int(pageHeight * scale)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { fail("cannot create bitmap") }
    context.setFillColor(CGColor(gray: background, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: scale, y: scale)
    draw(report, in: context)
    guard let image = context.makeImage() else { fail("cannot finish bitmap") }
    return image
}

/// Stores the picture turned 90 degrees counter-clockwise; EXIF orientation 6 turns it back.
func sideways(_ image: CGImage) -> CGImage {
    let width = image.width, height = image.height
    guard let context = CGContext(data: nil, width: height, height: width, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { fail("cannot create rotated bitmap") }
    context.translateBy(x: CGFloat(height), y: 0)
    context.rotate(by: .pi / 2)
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let rotated = context.makeImage() else { fail("cannot finish rotated bitmap") }
    return rotated
}

/// Simulates a hand-held photo: the page turned a few degrees on a paper-grey background.
func tilted(_ image: CGImage, degrees: CGFloat) -> CGImage {
    let width = image.width, height = image.height
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { fail("cannot create tilted bitmap") }
    context.setFillColor(CGColor(gray: 0.93, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high
    context.translateBy(x: CGFloat(width) / 2, y: CGFloat(height) / 2)
    context.rotate(by: degrees * .pi / 180)
    context.draw(image, in: CGRect(x: -CGFloat(width) / 2, y: -CGFloat(height) / 2, width: CGFloat(width), height: CGFloat(height)))
    guard let result = context.makeImage() else { fail("cannot finish tilted bitmap") }
    return result
}

func writePDF(_ url: URL, pages: Int = 1, info: [CFString: Any] = [:], drawPage: (CGContext, Int) -> Void) {
    var mediaBox = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
    guard let context = CGContext(url as CFURL, mediaBox: &mediaBox, info as CFDictionary) else {
        fail("cannot create \(url.lastPathComponent)")
    }
    for index in 0..<pages {
        context.beginPDFPage(nil)
        drawPage(context, index)
        context.endPDFPage()
    }
    context.closePDF()
}

func writeImage(_ image: CGImage, to url: URL, type: String, properties: [CFString: Any] = [:]) {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, type as CFString, 1, nil) else {
        fail("cannot create \(url.lastPathComponent)")
    }
    CGImageDestinationAddImage(destination, image, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { fail("cannot write \(url.lastPathComponent)") }
}

let arguments = CommandLine.arguments
guard arguments.count == 2 else { fail("usage: make-fixtures <output directory>") }
let output = URL(fileURLWithPath: arguments[1], isDirectory: true)
try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func file(_ name: String) -> URL { output.appendingPathComponent(name) }

writePDF(file("text.pdf")) { context, _ in draw(report, in: context) }

let scan = bitmap(scale: 2, background: 1)
writePDF(file("scanned.pdf")) { context, _ in
    context.draw(scan, in: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
}

writePDF(file("scanned-footer.pdf")) { context, _ in
    context.draw(scan, in: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
    draw([Label(text: "第1页 共1页 打印时间：2026-01-01 08:00", x: 60, top: 800, size: 9)], in: context)
}

guard let rotatedScan = PDFDocument(url: file("scanned.pdf")), let firstPage = rotatedScan.page(at: 0) else {
    fail("cannot reopen scanned.pdf")
}
firstPage.rotation = 90
guard rotatedScan.write(to: file("scanned-rotated.pdf")) else { fail("cannot write scanned-rotated.pdf") }

let photo = bitmap(scale: 1.5, background: 0.93)
writeImage(photo, to: file("photo.png"), type: "public.png")
writeImage(sideways(photo), to: file("rotated.jpg"), type: "public.jpeg",
           properties: [kCGImagePropertyOrientation: 6, kCGImageDestinationLossyCompressionQuality: 0.9])
writeImage(sideways(photo), to: file("sideways.png"), type: "public.png")
writeImage(tilted(photo, degrees: 4), to: file("skewed.png"), type: "public.png")

let sips = Process()
sips.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
sips.arguments = ["-s", "format", "heic", file("photo.png").path, "--out", file("photo.heic").path]
sips.standardOutput = FileHandle.nullDevice
do { try sips.run() } catch { fail("cannot run sips") }
sips.waitUntilExit()
guard sips.terminationStatus == 0 else { fail("sips failed with status \(sips.terminationStatus)") }

writePDF(file("locked.pdf"), info: [kCGPDFContextUserPassword: "fixture-user",
                                    kCGPDFContextOwnerPassword: "fixture-owner"]) { context, _ in
    draw(report, in: context)
}

// Opens without a password, but an owner password forbids copying (common for hospital exports).
writePDF(file("restricted.pdf"), info: [kCGPDFContextOwnerPassword: "fixture-owner",
                                        kCGPDFContextAllowsCopying: false]) { context, _ in
    draw(report, in: context)
}

// Restricted, but copying the text is allowed: read like any other PDF.
writePDF(file("print-locked.pdf"), info: [kCGPDFContextOwnerPassword: "fixture-owner",
                                          kCGPDFContextAllowsCopying: true,
                                          kCGPDFContextAllowsPrinting: false]) { context, _ in
    draw(report, in: context)
}

guard let tiff = CGImageDestinationCreateWithURL(file("two-pages.tiff") as CFURL, "public.tiff" as CFString, 2, nil) else {
    fail("cannot create two-pages.tiff")
}
CGImageDestinationAddImage(tiff, photo, nil)
CGImageDestinationAddImage(tiff, scan, nil)
guard CGImageDestinationFinalize(tiff) else { fail("cannot write two-pages.tiff") }

// Text PDFs often end with a short signature page or a blank page; neither holds a picture.
writePDF(file("short-pages.pdf"), pages: 3) { context, index in
    if index == 0 { draw(report, in: context) }
    if index == 1 { draw([Label(text: "报告医师：测试乙", x: 60, top: 80, size: 14)], in: context) }
}

writePDF(file("many-pages.pdf"), pages: 201) { context, index in
    draw([Label(text: "第\(index + 1)页：虚构测试文本，用于验证页数上限。", x: 60, top: 80, size: 14)], in: context)
}

func writeBytes(_ text: String, to name: String) {
    do { try Data(text.utf8).write(to: file(name)) } catch { fail("cannot write \(name)") }
}
writeBytes("%PDF-1.7\nthis is not really a pdf\n", to: "broken.pdf")
writeBytes("not an image", to: "broken.png")
writeBytes("PK unsupported office document", to: "notes.docx")
print("fixtures ready")
