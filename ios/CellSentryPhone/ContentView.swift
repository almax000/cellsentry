import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct ContentView: View {
    var body: some View {
        TabView {
            PiiTestView().tabItem { Label("PII mmBERT", systemImage:"eye.slash") }
            FormulaTestView().tabItem { Label("公式", systemImage:"function") }
        }
    }
}

struct FormulaTestView: View {
    @StateObject private var model = PhoneViewModel()
    @State private var importing = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Form {
                Section("模型") {
                    Text("MiniCPM5-2B · v2 Q4_K_M · 1.56 GB")
                    Text("1024 上下文 · 关闭思考 · 单条复核").font(.caption).foregroundStyle(.secondary)
                    Button("从文件导入 GGUF") { importing = true }.disabled(model.busy)
                    Button("加载模型") { model.load() }.disabled(model.busy || model.loaded)
                    Button("卸载模型") { model.unload() }.disabled(!model.loaded || model.busy)
                    Text(model.status).font(.callout)
                    if model.busy {
                        ProgressView()
                        Button("取消", role: .destructive) { model.cancel() }
                    }
                }
                Section("公式样例") {
                    Picker("测试用例", selection: Binding(get: { model.selectedID }, set: { model.select($0) })) {
                        ForEach(model.samples) { sample in
                            Text("\(sample.id) · \(sample.issue.ruleId)").tag(sample.id)
                        }
                    }
                    TextField("公式", text: $model.formula).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("规则告警", text: $model.finding, axis: .vertical)
                    TextField("业务上下文", text: $model.context, axis: .vertical).lineLimit(3...8)
                    Button("离线复核这一条") { model.review() }.disabled(!model.loaded || model.busy)
                }.disabled(model.busy)
                if !model.result.isEmpty {
                    Section("复核结果") { Text(model.result).textSelection(.enabled) }
                }
                if !model.report.isEmpty {
                    Section("测试记录") {
                        ShareLink("导出测试记录", item: model.report)
                        Text(model.report).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("CellSentry 端侧测试")
            .onDisappear { model.unload() }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
                switch result {
                case .success(let urls): if let url = urls.first { model.importModel(url) }
                case .failure(let error): model.status = error.localizedDescription
                }
            }
            .onChange(of: scenePhase) { phase in if phase == .background { model.unload() } }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
                model.unload()
            }
        }
    }
}
