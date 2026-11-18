// The app icon: `swift scripts/make-icon.swift src-tauri/icons/icon-source.png && npx tauri icon src-tauri/icons/icon-source.png`
import AppKit
import CoreText

let S: CGFloat = 1024
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

// macOS-style squircle: 824 px tile centred in 1024
let inset: CGFloat = 100
let tile = CGRect(x: inset, y: inset, width: S - 2 * inset, height: S - 2 * inset)
let path = CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)
// soft drop shadow
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.55))
ctx.addPath(path); ctx.setFillColor(CGColor(red: 0.02, green: 0.02, blue: 0.035, alpha: 1)); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(path); ctx.clip()
// black glass with a faint violet glow from the top
let bg = CGGradient(colorsSpace: cs, colors: [CGColor(red: 0.07, green: 0.04, blue: 0.11, alpha: 1), CGColor(red: 0.01, green: 0.01, blue: 0.015, alpha: 1)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(bg, startCenter: CGPoint(x: S/2, y: S*0.62), startRadius: 0, endCenter: CGPoint(x: S/2, y: S*0.62), endRadius: S*0.55, options: [.drawsAfterEndLocation])
// scanlines
ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.35))
var y = tile.minY
while y < tile.maxY { ctx.fill(CGRect(x: tile.minX, y: y, width: tile.width, height: 3)); y += 8 }

// "IB" in ANSI-shadow block letters, drawn with a monospace font
let rows = ["██╗██████╗ ", "██║██╔══██╗", "██║██████╔╝", "██║██╔══██╗", "██║██████╔╝", "╚═╝╚═════╝ "]
let font = CTFontCreateWithName("Menlo-Bold" as CFString, 76, nil)
let lineH: CGFloat = 86
let probe = NSAttributedString(string: rows[0], attributes: [.font: font])
let lineW = CTLineGetTypographicBounds(CTLineCreateWithAttributedString(probe), nil, nil, nil)
let x0 = (S - CGFloat(lineW)) / 2
let top = S/2 + lineH * 3 - 30
let colors: [(CGFloat, CGFloat, CGFloat)] = [(0.69, 0.55, 1.0), (0.78, 0.55, 1.0), (0.88, 0.55, 0.98), (0.97, 0.56, 0.86), (1.0, 0.6, 0.75), (0.55, 0.45, 0.75)]
for (i, row) in rows.enumerated() {
  let (r, g, b) = colors[i]
  let col = NSColor(red: r, green: g, blue: b, alpha: 1)
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: row, attributes: [.font: font, .foregroundColor: col]))
  let yy = top - CGFloat(i) * lineH
  // glow pass, then the crisp pass
  ctx.saveGState()
  ctx.setShadow(offset: .zero, blur: 26, color: CGColor(red: r, green: g, blue: b, alpha: 0.75))
  ctx.textPosition = CGPoint(x: x0, y: yy); CTLineDraw(line, ctx)
  ctx.restoreGState()
  ctx.textPosition = CGPoint(x: x0, y: yy); CTLineDraw(line, ctx)
}
// a thin prompt line under it
let p = CTLineCreateWithAttributedString(NSAttributedString(string: "> jack in_", attributes: [.font: CTFontCreateWithName("Menlo" as CFString, 46, nil), .foregroundColor: NSColor(red: 0.55, green: 0.5, blue: 0.7, alpha: 1)]))
let pw = CTLineGetTypographicBounds(p, nil, nil, nil)
ctx.textPosition = CGPoint(x: (S - CGFloat(pw)) / 2, y: top - lineH * 6 - 40); CTLineDraw(p, ctx)
ctx.restoreGState()
// rim
ctx.addPath(path); ctx.setStrokeColor(CGColor(red: 0.6, green: 0.45, blue: 0.95, alpha: 0.35)); ctx.setLineWidth(4); ctx.strokePath()

let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
