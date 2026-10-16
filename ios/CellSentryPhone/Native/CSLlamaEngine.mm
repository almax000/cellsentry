#import "CSLlamaEngine.h"
#import <llama/llama.h>
#import <TargetConditionals.h>
#import <mach/mach.h>
#include <atomic>
#include <algorithm>
#include <chrono>
#include <string>
#include <vector>

static NSError *Failure(NSString *message) {
    return [NSError errorWithDomain:@"CellSentry.Llama" code:1
                          userInfo:@{NSLocalizedDescriptionKey: message}];
}
static bool Aborted(void *data) { return ((std::atomic_bool *)data)->load(); }
static bool LoadProgress(float progress, void *data) { return !Aborted(data); }
using Clock = std::chrono::steady_clock;
static double Seconds(Clock::time_point start) {
    return std::chrono::duration<double>(Clock::now() - start).count();
}

@implementation CSLlamaEngine {
    llama_model *_model;
    llama_context *_context;
    std::atomic_bool _cancelled;
}
- (instancetype)init {
    if ((self = [super init])) {
        _model = nullptr; _context = nullptr; _cancelled.store(false);
        static dispatch_once_t once;
        dispatch_once(&once, ^{ llama_backend_init(); });
    }
    return self;
}
- (void)resetCancellation { _cancelled.store(false); }
- (void)cancel { _cancelled.store(true); }
- (void)unload {
    if (_context) { llama_free(_context); _context = nullptr; }
    if (_model) { llama_model_free(_model); _model = nullptr; }
}
- (void)dealloc { [self unload]; }
+ (double)residentMemoryMiB {
    task_vm_info_data_t info = {};
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return 0;
    return (double)info.phys_footprint / 1048576.0;
}
- (NSDictionary<NSString *,id> *)loadModelAtPath:(NSString *)path error:(NSError **)error {
    [self unload];
    const auto start = Clock::now();
    if (_cancelled.load()) { if (error) *error = Failure(@"已取消加载"); return nil; }
    auto mp = llama_model_default_params();
    mp.load_mode = LLAMA_LOAD_MODE_MMAP;
#if TARGET_OS_SIMULATOR
    mp.n_gpu_layers = 0;
#else
    mp.n_gpu_layers = 99;
#endif
    mp.progress_callback = LoadProgress;
    mp.progress_callback_user_data = &_cancelled;
    _model = llama_model_load_from_file(path.fileSystemRepresentation, mp);
    if (!_model) { if (error) *error = Failure(@"模型加载失败或已取消，请查看 Xcode 控制台"); return nil; }
    auto cp = llama_context_default_params();
    cp.n_ctx = 1024; cp.n_batch = 128; cp.n_ubatch = 128; cp.n_seq_max = 1;
    cp.n_threads = 4; cp.n_threads_batch = 4;
    cp.abort_callback = Aborted; cp.abort_callback_data = &_cancelled;
    _context = llama_init_from_model(_model, cp);
    if (!_context || _cancelled.load()) {
        [self unload]; if (error) *error = Failure(@"推理上下文创建失败或已取消"); return nil;
    }
    return @{ @"loadSeconds": @(Seconds(start)), @"memoryMiB": @([CSLlamaEngine residentMemoryMiB]) };
}
- (NSDictionary<NSString *,id> *)generatePrompt:(NSString *)prompt maximumTokens:(NSInteger)limit error:(NSError **)error {
    if (!_model || !_context) { if (error) *error = Failure(@"请先加载模型"); return nil; }
    if (_cancelled.load()) { if (error) *error = Failure(@"已取消"); return nil; }
    const auto start = Clock::now();
    const auto *vocab = llama_model_get_vocab(_model);
    const std::string input = prompt.UTF8String;
    // The supplied prompt already contains the one BOS and no-thinking chat prefix.
    int32_t count = llama_tokenize(vocab, input.data(), (int32_t)input.size(), nullptr, 0, false, true);
    if (count == INT32_MIN || count >= 0) { if (error) *error = Failure(@"输入分词失败"); return nil; }
    std::vector<llama_token> tokens((size_t)-count);
    count = llama_tokenize(vocab, input.data(), (int32_t)input.size(), tokens.data(), (int32_t)tokens.size(), false, true);
    const int maximum = std::min(420, (int)limit);
    if (count <= 0 || maximum < 1 || count + maximum > (int)llama_n_ctx(_context)) {
        if (error) *error = Failure(@"上下文超过 1024 token，请缩短业务说明（不会静默截断）"); return nil;
    }
    llama_memory_clear(llama_get_memory(_context), true);
    double sampledPeak = [CSLlamaEngine residentMemoryMiB];
    for (int offset = 0; offset < count; offset += 128) {
        if (_cancelled.load() || llama_decode(_context,
            llama_batch_get_one(tokens.data() + offset, std::min(128, count - offset))) != 0) {
            llama_memory_clear(llama_get_memory(_context), true);
            if (error) *error = Failure(@"预填充失败或已取消"); return nil;
        }
        sampledPeak = std::max(sampledPeak, [CSLlamaEngine residentMemoryMiB]);
    }
    const double prefill = Seconds(start);
    auto *sampler = llama_sampler_init_greedy();
    std::string output;
    int generated = 0;
    bool stopped = false;
    for (; generated < maximum; ++generated) {
        if (_cancelled.load()) break;
        const llama_token token = llama_sampler_sample(sampler, _context, -1);
        if (llama_vocab_is_eog(vocab, token)) { stopped = true; break; }
        char small[256];
        int size = llama_token_to_piece(vocab, token, small, sizeof(small), 0, false);
        if (size < 0) {
            std::vector<char> large((size_t)-size);
            size = llama_token_to_piece(vocab, token, large.data(), (int32_t)large.size(), 0, false);
            if (size > 0) output.append(large.data(), size);
        } else { output.append(small, size); }
        llama_token next = token;
        if (llama_decode(_context, llama_batch_get_one(&next, 1)) != 0) {
            llama_sampler_free(sampler); llama_memory_clear(llama_get_memory(_context), true);
            if (error) *error = Failure(@"生成失败或已取消"); return nil;
        }
        sampledPeak = std::max(sampledPeak, [CSLlamaEngine residentMemoryMiB]);
    }
    llama_sampler_free(sampler);
    llama_memory_clear(llama_get_memory(_context), true);
    if (_cancelled.load()) { if (error) *error = Failure(@"已取消，本次结果不用于判断"); return nil; }
    NSString *text = [[NSString alloc] initWithBytes:output.data() length:output.size() encoding:NSUTF8StringEncoding];
    if (!text) { if (error) *error = Failure(@"模型输出不是有效 UTF-8"); return nil; }
    return @{ @"raw": text, @"finishReason": stopped ? @"stop" : @"length",
        @"promptTokens": @(count), @"generatedTokens": @(generated),
        @"prefillSeconds": @(prefill), @"totalSeconds": @(Seconds(start)),
        @"sampledPeakMemoryMiB": @(sampledPeak) };
}
@end
