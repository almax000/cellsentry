import SwiftUI
import UIKit

struct PiiTestView: View {
    @StateObject private var model = PiiViewModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Form {
                Section("内置 PII 模型") {
                    Text("mmBERT v2 · Q8_0 · 约 341 MB")
                    Text("候选判别最小测试；不含完整候选提取、文件解析或自动脱敏。训练模型仍有漏报，仅供测试。").font(.caption)
                    Button("加载内置 mmBERT") { model.load() }.disabled(model.busy || model.loaded)
                    Button("卸载模型") { model.unload() }.disabled(model.busy || !model.loaded)
                    Text(model.status)
                    if model.busy { ProgressView(); Button("取消") { model.cancel() } }
                }
                Section("8 类合成样例") {
                    Picker("样例", selection: Binding(get:{model.selectedID},set:{model.select($0)})) {
                        ForEach(model.samples) { Text($0.id).tag($0.id) }
                    }
                    TextEditor(text:$model.text).frame(minHeight:200).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("离线判别候选") { model.classify() }.disabled(!model.loaded)
                }.disabled(model.busy)
                if !model.result.isEmpty { Section("结果") { Text(model.result).textSelection(.enabled) } }
                if !model.report.isEmpty {
                    Section("测试记录") {
                        ShareLink("导出 PII 测试记录",item:model.report)
                        Text(model.report).font(.system(.caption,design:.monospaced)).textSelection(.enabled)
                    }
                }
            }.navigationTitle("mmBERT 离线测试")
        }
        .onDisappear { model.unload() }
        .onChange(of:scenePhase) { _, phase in if phase == .background { model.unload() } }
        .onReceive(NotificationCenter.default.publisher(for:UIApplication.didReceiveMemoryWarningNotification)) { _ in model.unload() }
    }
}
