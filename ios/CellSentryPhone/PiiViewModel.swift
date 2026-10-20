import Foundation
import SwiftUI

struct PiiSample: Decodable, Identifiable { let id: String; let text: String; let expectedClass: Int }
struct PiiHead: Decodable {
    let classes: [String]; let threshold: Double; let pooling: String
    let weight: [[Double]]; let bias: [Double]
    func probabilities(_ embedding: [Double]) throws -> [Double] {
        guard embedding.count == 768, embedding.allSatisfy({ $0.isFinite }),
            classes.count == 8, weight.count == 8, bias.count == 8,
            weight.allSatisfy({ $0.count == 768 && $0.allSatisfy({ $0.isFinite }) }),
            bias.allSatisfy({ $0.isFinite }), pooling == "masked_mean", threshold == 0.95 else {
            throw PhoneError.message("PII 分类头或向量格式错误")
        }
        let logits = zip(weight, bias).map { row, bias in zip(row, embedding).reduce(bias) { $0 + $1.0 * $1.1 } }
        guard let maximum = logits.max(), maximum.isFinite else { throw PhoneError.message("PII 分类得分无效") }
        let exponential = logits.map { exp($0 - maximum) }, total = logits.map { exp($0 - maximum) }.reduce(0, +)
        guard total.isFinite, total > 0 else { throw PhoneError.message("PII 概率无效") }
        return exponential.map { $0 / total }
    }
}
enum PiiAssets {
    struct Manifest: Decodable { let filename: String; let bytes: Int64; let sha256: String }
    static func url(_ name: String, _ ext: String) throws -> URL {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "PII") else {
            throw PhoneError.message("安装包缺少 PII 资源：\(name).\(ext)")
        }
        return url
    }
    static func read<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: Data(contentsOf: url(name, "json")))
    }
}

@MainActor
final class PiiViewModel: ObservableObject {
    @Published var busy = false
    @Published var loaded = false
    @Published var status = "Q8 mmBERT 随 App 内置，点击加载即可离线测试"
    @Published var samples: [PiiSample] = []
    @Published var selectedID = ""
    @Published var text = ""
    @Published var result = ""
    @Published var report = ""
    private let engine = CSPiiEngine()
    private let worker = DispatchQueue(label: "CellSentry.PII", qos: .userInitiated)
    private let cancellation = CancellationFlag()
    private var generation = 0

    init() {
        do {
            samples = try PiiAssets.read("pii-samples", as: [PiiSample].self)
            if let first = samples.first { select(first.id) }
        } catch { status = error.localizedDescription }
    }
    func select(_ id: String) {
        guard let sample = samples.first(where: { $0.id == id }) else { return }
        selectedID = id; text = sample.text; result = ""; report = ""
    }
    private func perform(_ label: String, action: @escaping (CSPiiEngine, CancellationFlag) throws -> (String, String, Bool)) {
        guard !busy else { return }
        busy = true; status = label; result = ""; report = ""
        generation += 1; let ticket = generation
        cancellation.reset(); engine.resetCancellation()
        let engine = self.engine, cancellation = self.cancellation
        worker.async { [weak self] in
            let output = Result { try action(engine, cancellation) }
            Task { @MainActor [weak self] in
                guard let self, self.generation == ticket else { return }
                self.busy = false
                switch output {
                case .success(let (display, record, loaded)):
                    self.result = display; self.report = record; self.loaded = loaded; self.status = "完成"
                case .failure(let error): self.status = error.localizedDescription
                }
            }
        }
    }
    func load() {
        perform("校验并加载内置 Q8 mmBERT…") { engine, cancellation in
            let manifest = try PiiAssets.read("pii-model", as: PiiAssets.Manifest.self)
            let model = try PiiAssets.url(String(manifest.filename.dropLast(5)), "gguf")
            try PhoneAssets.verify(model, bytes: manifest.bytes, sha256: manifest.sha256, cancelled: { cancellation.cancelled })
            let metrics = try engine.load(path: model.path)
            return ("PII 模型已加载", try Self.json(["operation":"pii-load", "metrics":metrics,
                "modelSHA256":manifest.sha256, "os":ProcessInfo.processInfo.operatingSystemVersionString]), true)
        }
    }
    func classify() {
        guard loaded else { return }
        let input = text, sample = samples.first(where: { $0.id == selectedID })
        perform("离线判别 PII 候选…") { engine, cancellation in
            let head = try PiiAssets.read("pii-head", as: PiiHead.self)
            var metrics = try engine.embedding(text: input)
            guard !cancellation.cancelled else { throw PhoneError.message("已取消") }
            guard let values = metrics.removeValue(forKey: "embedding") as? [NSNumber] else { throw PhoneError.message("缺少 PII 向量") }
            let probabilities = try head.probabilities(values.map { $0.doubleValue })
            let predicted = probabilities.indices.max(by: { probabilities[$0] < probabilities[$1] })!
            let confidence = probabilities[predicted]
            let recommendation = predicted == 0 ? "背景信息（仅供复核）" : (confidence >= head.threshold ? "建议遮盖候选，仍需人工确认" : "置信度不足，需要人工复核")
            var record: [String:Any] = ["operation":"pii-classify", "metrics":metrics,
                "classes":head.classes, "probabilities":probabilities, "predictedClass":head.classes[predicted],
                "threshold":head.threshold, "recommendation":recommendation, "input":input,
                "runtime":"llama.cpp b11429", "pooling":"raw masked mean; FP32 linear head",
                "os":ProcessInfo.processInfo.operatingSystemVersionString]
            if let sample, input == sample.text { record["sampleID"] = sample.id; record["correct"] = predicted == sample.expectedClass }
            return ("\(head.classes[predicted]) · \(String(format:"%.2f", confidence*100))%\n\(recommendation)", try Self.json(record), true)
        }
    }
    func cancel() { cancellation.cancel(); engine.cancel() }
    func unload() {
        cancel(); generation += 1; let ticket = generation
        loaded = false; busy = true
        let engine = self.engine
        worker.async { [weak self] in
            engine.unload()
            Task { @MainActor [weak self] in
                guard let self, self.generation == ticket else { return }
                self.busy = false; self.status = "PII 模型已卸载"
            }
        }
    }
    nonisolated private static func json(_ value: [String:Any]) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]),as:UTF8.self)
    }
}
