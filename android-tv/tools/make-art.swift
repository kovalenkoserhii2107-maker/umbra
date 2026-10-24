// Рисует баннер 320×180 (Android TV) и иконку приложения из public/brand-mark.webp.
// Запуск из корня репозитория: swift android-tv/tools/make-art.swift
import AppKit

let root = FileManager.default.currentDirectoryPath
let res = "\(root)/android-tv/app/src/main/res"
guard let mark = NSImage(contentsOfFile: "\(root)/public/brand-mark.webp") else {
    fatalError("Не нашёл public/brand-mark.webp — запускай из корня репозитория")
}

func png(width: Int, height: Int, to path: String, draw: (CGRect) -> Void) {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    draw(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    try! FileManager.default.createDirectory(
        atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    print("✓ \(path.replacingOccurrences(of: root + "/", with: ""))")
}

// Баннер: чёрный фон, затмение слева, «UMBRA» с разрядкой справа (как в шапке сайта).
// xhdpi: 640×360 px = 320×180 dp — плотность экрана BRAVIA.
png(width: 640, height: 360, to: "\(res)/drawable-xhdpi/banner.png") { rect in
    NSColor.black.setFill()
    rect.fill()
    let side: CGFloat = 250
    mark.draw(in: CGRect(x: 44, y: (rect.height - side) / 2, width: side, height: side))
    let title = NSAttributedString(string: "UMBRA", attributes: [
        .font: NSFont.systemFont(ofSize: 68, weight: .semibold),
        .foregroundColor: NSColor(calibratedRed: 0.99, green: 0.99, blue: 0.99, alpha: 1),
        .kern: 10,
    ])
    let size = title.size()
    title.draw(at: CGPoint(x: 316, y: (rect.height - size.height) / 2))
}

// Иконка приложения: затмение на чёрном круге.
for (folder, px) in [("mipmap-xhdpi", 96), ("mipmap-xxhdpi", 144), ("mipmap-xxxhdpi", 192)] {
    png(width: px, height: px, to: "\(res)/\(folder)/ic_launcher.png") { rect in
        NSColor.black.setFill()
        NSBezierPath(ovalIn: rect).fill()
        mark.draw(in: rect.insetBy(dx: rect.width * 0.04, dy: rect.height * 0.04))
    }
}
