import Foundation
import CryptoKit

struct ModelManifest: Decodable {
    let filename: String
    let bytes: Int64
    let sha256: String
    let runtime: String
    let context: Int
    let maxTokens: Int
}
struct FormulaIssue: Codable {
    var ruleId: String
    var sheetName: String
    var cellAddress: String
    var formula: String
    var message: String
    var confidence: Double
    var context: String
}
struct FormulaSample: Decodable, Identifiable {
    let id: String
    let issue: FormulaIssue
    let expectedIsValid: Bool
    let expectedPrompt: String
}
struct Judgment: Decodable {
    let cellAddress: String
    let ruleId: String
    let isValid: Bool
    let adjustedConfidence: Double
    let reasoning: String
}
enum PhoneError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

enum PhoneAssets {
    static func data(_ name: String, _ ext: String) throws -> Data {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
            throw PhoneError.message("缺少资源 \(name).\(ext)")
        }
        return try Data(contentsOf: url)
    }
    static func manifest() throws -> ModelManifest {
        try JSONDecoder().decode(ModelManifest.self, from: data("model", "json"))
    }
    static func samples() throws -> [FormulaSample] {
        try JSONDecoder().decode([FormulaSample].self, from: data("samples", "json"))
    }
    static func userPrompt(_ issue: FormulaIssue) throws -> String {
        let template = try String(decoding: data("audit-prompt", "txt"), as: UTF8.self)
        let values = ["ruleId": issue.ruleId, "sheetName": issue.sheetName,
            "cellAddress": issue.cellAddress, "formula": issue.formula, "message": issue.message,
            "confidence": String(issue.confidence), "context": issue.context]
        // Replace only tokens from the original template, never tokens introduced by cell text.
        let expression = try NSRegularExpression(pattern: #"\{\{([a-zA-Z]+)\}\}"#)
        var result = template
        let matches = expression.matches(in: template, range: NSRange(template.startIndex..., in: template))
        for match in matches.reversed() {
            let key = String(template[Range(match.range(at: 1), in: template)!])
            result.replaceSubrange(Range(match.range, in: result)!, with: values[key] ?? "")
        }
        return result
    }
    static func wrappedPrompt(_ issue: FormulaIssue) throws -> String {
        // Exact no-tools MiniCPM5-2B chat template with enable_thinking=false.
        // llama_tokenize(add_special=false, parse_special=true) prevents a duplicate BOS.
        "<s><|im_start|>system\nYou are a spreadsheet formula auditor.<|im_end|>\n"
        + "<|im_start|>user\n" + (try userPrompt(issue)) + "<|im_end|>\n"
        + "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    }
    static func validate(_ raw: String, issue: FormulaIssue, finishReason: String) throws -> Judgment {
        guard finishReason == "stop", let bytes = raw.data(using: .utf8) else {
            throw PhoneError.message("输出被截断，本次保留告警")
        }
        let result = try JSONDecoder().decode([Judgment].self, from: bytes)
        guard result.count == 1, let judgment = result.first,
            judgment.cellAddress == issue.cellAddress, judgment.ruleId == issue.ruleId,
            judgment.adjustedConfidence.isFinite, (0...1).contains(judgment.adjustedConfidence),
            !judgment.reasoning.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw PhoneError.message("返回的地址、规则或字段无效，本次保留告警")
        }
        return judgment
    }
    static func modelURL() throws -> URL {
        let folder = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Models")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var excluded = folder
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        return folder.appendingPathComponent(try manifest().filename)
    }
    static func verify(_ url: URL, cancelled: () -> Bool) throws {
        let manifest = try manifest()
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard Int64(size) == manifest.bytes else { throw PhoneError.message("模型大小不匹配，请导入指定的 v2 Q4_K_M GGUF") }
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var hash = SHA256()
        while let chunk = try file.read(upToCount: 8 * 1024 * 1024), !chunk.isEmpty {
            if cancelled() { throw PhoneError.message("已取消校验") }
            hash.update(data: chunk)
        }
        guard hash.finalize().map({ String(format: "%02x", $0) }).joined() == manifest.sha256 else {
            throw PhoneError.message("模型 SHA256 不匹配")
        }
    }
}
