import Foundation
import SwiftUI
import UIKit

final class CancellationFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func reset() { lock.lock(); value = false; lock.unlock() }
    func cancel() { lock.lock(); value = true; lock.unlock() }
    var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return value }
}

@MainActor
final class PhoneViewModel: ObservableObject {
    @Published var busy = false
    @Published var loaded = false
    @Published var status = "导入 v2 GGUF 后加载模型"
    @Published var result = ""
    @Published var report = ""
    @Published var samples: [FormulaSample] = []
    @Published var selectedID = ""
    @Published var formula = ""
    @Published var context = ""
    @Published var finding = ""
    private let engine = CSLlamaEngine()
    private let worker = DispatchQueue(label: "CellSentry.Llama", qos: .userInitiated)
    private let cancellation = CancellationFlag()

    struct WorkResult {
        var status: String
        var loaded: Bool?
        var result: String?
        var report: String?
    }

    init() {
        do {
            samples = try PhoneAssets.samples()
            // Detect generated prompt drift before allowing a benchmark to be called comparable.
            for sample in samples {
                guard try PhoneAssets.userPrompt(sample.issue) == sample.expectedPrompt else {
                    throw PhoneError.message("手机提示词与桌面不一致，请重新生成测试资源")
                }
            }
            if let first = samples.first { select(first.id) }
        } catch { samples = []; selectedID = ""; status = error.localizedDescription }
    }

    func select(_ id: String) {
        guard let sample = samples.first(where: { $0.id == id }) else { return }
        selectedID = id; formula = sample.issue.formula
        context = sample.issue.context; finding = sample.issue.message
        result = ""; report = ""
    }

    private func work(_ label: String, action: @escaping (CSLlamaEngine, CancellationFlag) throws -> WorkResult) {
        guard !busy else { return }
        busy = true; status = label; result = ""; report = ""
        cancellation.reset(); engine.resetCancellation()
        let engine = self.engine, cancellation = self.cancellation
        worker.async { [weak self] in
            let outcome: Result<WorkResult, Error>
            do {
                if cancellation.cancelled { throw PhoneError.message("已取消") }
                outcome = .success(try action(engine, cancellation))
            } catch { outcome = .failure(error) }
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.busy = false
                switch outcome {
                case .success(let value):
                    self.status = value.status
                    if let loaded = value.loaded { self.loaded = loaded }
                    if let result = value.result { self.result = result }
                    if let report = value.report { self.report = report }
                case .failure(let error): self.status = error.localizedDescription
                }
            }
        }
    }

    func importModel(_ url: URL) {
        guard !busy else { return }
        loaded = false
        work("正在导入并校验模型…") { engine, cancellation in
            engine.unload()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let destination = try PhoneAssets.modelURL()
            let staged = destination.appendingPathExtension("partial")
            defer { try? FileManager.default.removeItem(at: staged) }
            if FileManager.default.fileExists(atPath: staged.path) { try FileManager.default.removeItem(at: staged) }
            let input = try FileHandle(forReadingFrom: url)
            defer { try? input.close() }
            guard FileManager.default.createFile(atPath: staged.path, contents: nil) else {
                throw PhoneError.message("无法创建模型副本，请检查剩余空间")
            }
            let output = try FileHandle(forWritingTo: staged)
            defer { try? output.close() }
            while let chunk = try input.read(upToCount: 8 * 1024 * 1024), !chunk.isEmpty {
                if cancellation.cancelled { throw PhoneError.message("已取消导入") }
                try output.write(contentsOf: chunk)
            }
            try output.close()
            try PhoneAssets.verify(staged, cancelled: { cancellation.cancelled })
            if cancellation.cancelled { throw PhoneError.message("已取消导入") }
            if FileManager.default.fileExists(atPath: destination.path) {
                _ = try FileManager.default.replaceItemAt(destination, withItemAt: staged)
            } else { try FileManager.default.moveItem(at: staged, to: destination) }
            return WorkResult(status: "模型已导入，SHA256 校验通过；点击加载模型", loaded: false)
        }
    }

    func load() {
        work("正在校验并加载模型…") { engine, cancellation in
            try PhoneAssets.verify(PhoneAssets.modelURL(), cancelled: { cancellation.cancelled })
            let metrics = try engine.load(path: PhoneAssets.modelURL().path)
            return WorkResult(status: "模型已加载（真机使用 Metal，模拟器使用 CPU）", loaded: true,
                report: try Self.json(["operation": "load", "metrics": metrics,
                    "os": ProcessInfo.processInfo.operatingSystemVersionString]))
        }
    }

    func review() {
        guard loaded, let selected = samples.first(where: { $0.id == selectedID }) else { return }
        var issue = selected.issue
        issue.formula = formula; issue.message = finding; issue.context = context
        let edited = issue.formula != selected.issue.formula || issue.message != selected.issue.message || issue.context != selected.issue.context
        work("正在本地复核…") { engine, cancellation in
            let metrics = try engine.generate(prompt: PhoneAssets.wrappedPrompt(issue), maximumTokens: 420)
            if cancellation.cancelled { throw PhoneError.message("已取消") }
            let raw = metrics["raw"] as? String ?? ""
            let reason = metrics["finishReason"] as? String ?? ""
            var display = "", protocolValid = false
            var actual: Bool?
            do {
                let judgment = try PhoneAssets.validate(raw, issue: issue, finishReason: reason)
                protocolValid = true; actual = judgment.isValid
                display = (judgment.isValid ? "模型判断：真实错误" : "模型判断：可能误报（保留原告警供人工复核）")
                    + "\n" + judgment.reasoning
            } catch { display = "复核失败，保留原告警：\(error.localizedDescription)" }
            var record: [String: Any] = ["operation": "review", "sampleID": selected.id,
                "edited": edited, "protocolValid": protocolValid, "metrics": metrics,
                "runtime": "llama.cpp b11429", "context": 1024, "maxTokens": 420,
                "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "modelSHA256": try PhoneAssets.manifest().sha256,
                "issue": try JSONSerialization.jsonObject(with: JSONEncoder().encode(issue))]
            if !edited {
                record["expectedIsValid"] = selected.expectedIsValid
                record["correct"] = protocolValid && actual == selected.expectedIsValid
            }
            return WorkResult(status: "复核完成；本测试版不自动撤销告警", result: display,
                report: try Self.json(record))
        }
    }

    func cancel() { cancellation.cancel(); engine.cancel(); if busy { status = "正在取消…" } }
    func unload() {
        cancel()
        let engine = self.engine
        worker.async { [weak self] in
            engine.unload()
            Task { @MainActor [weak self] in self?.loaded = false }
        }
    }
    nonisolated private static func json(_ object: [String: Any]) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]), as: UTF8.self)
    }
}
