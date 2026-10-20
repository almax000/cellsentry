#import "CSPiiEngine.h"
#import "CSLlamaEngine.h"
#import <llama/llama.h>
#import <TargetConditionals.h>
#include <atomic>
#include <chrono>
#include <cmath>
#include <vector>

static NSError *PiiFailure(NSString *message) {
    return [NSError errorWithDomain:@"CellSentry.PII" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];
}
static bool PiiAborted(void *data) { return ((std::atomic_bool *)data)->load(); }
static bool PiiProgress(float, void *data) { return !PiiAborted(data); }
using PiiClock = std::chrono::steady_clock;
static double PiiSeconds(PiiClock::time_point start) { return std::chrono::duration<double>(PiiClock::now()-start).count(); }

@implementation CSPiiEngine {
    llama_model *_model;
    llama_context *_context;
    std::atomic_bool _cancelled;
}
- (instancetype)init {
    if ((self=[super init])) {
        _model=nullptr; _context=nullptr; _cancelled.store(false);
        static dispatch_once_t once;
        dispatch_once(&once, ^{ llama_backend_init(); });
    }
    return self;
}
- (void)cancel { _cancelled.store(true); }
- (void)resetCancellation { _cancelled.store(false); }
- (void)unload {
    if (_context) { llama_free(_context); _context=nullptr; }
    if (_model) { llama_model_free(_model); _model=nullptr; }
}
- (void)dealloc { [self unload]; }
- (NSDictionary<NSString *,id> *)loadModelAtPath:(NSString *)path error:(NSError **)error {
    [self unload]; const auto start=PiiClock::now();
    auto mp=llama_model_default_params(); mp.load_mode=LLAMA_LOAD_MODE_MMAP;
#if TARGET_OS_SIMULATOR
    mp.n_gpu_layers=0;
#else
    mp.n_gpu_layers=99;
#endif
    mp.progress_callback=PiiProgress; mp.progress_callback_user_data=&_cancelled;
    _model=llama_model_load_from_file(path.fileSystemRepresentation,mp);
    if (!_model || _cancelled.load() || llama_model_n_embd(_model)!=768) {
        [self unload]; if(error)*error=PiiFailure(@"PII 模型加载失败或已取消"); return nil;
    }
    auto cp=llama_context_default_params(); cp.n_ctx=512; cp.n_batch=512; cp.n_ubatch=512;
    cp.n_seq_max=1; cp.n_threads=4; cp.n_threads_batch=4;
    cp.embeddings=true; cp.pooling_type=LLAMA_POOLING_TYPE_MEAN;
    cp.abort_callback=PiiAborted; cp.abort_callback_data=&_cancelled;
    _context=llama_init_from_model(_model,cp);
    if (!_context || _cancelled.load()) {
        [self unload]; if(error)*error=PiiFailure(@"PII 上下文创建失败或已取消"); return nil;
    }
    return @{ @"loadSeconds":@(PiiSeconds(start)), @"memoryMiB":@([CSLlamaEngine residentMemoryMiB]), @"context":@512 };
}
- (NSDictionary<NSString *,id> *)embeddingForText:(NSString *)text error:(NSError **)error {
    if (!_context || _cancelled.load()) { if(error)*error=PiiFailure(@"请先加载 PII 模型"); return nil; }
    const auto start=PiiClock::now();
    const auto vocab=llama_model_get_vocab(_model);
    NSData *utf8=[text dataUsingEncoding:NSUTF8StringEncoding];
    int32_t count=-llama_tokenize(vocab,(const char *)utf8.bytes,(int32_t)utf8.length,nullptr,0,true,true);
    if(count<=0 || count>512) { if(error)*error=PiiFailure(@"输入必须为 1–512 token，不会静默截断"); return nil; }
    std::vector<llama_token> tokens(count);
    if(llama_tokenize(vocab,(const char *)utf8.bytes,(int32_t)utf8.length,tokens.data(),count,true,true)!=count) {
        if(error)*error=PiiFailure(@"PII 分词失败"); return nil;
    }
    llama_batch batch=llama_batch_init(count,0,1); batch.n_tokens=count;
    for(int32_t i=0;i<count;i++) {
        batch.token[i]=tokens[i]; batch.pos[i]=i; batch.n_seq_id[i]=1;
        batch.seq_id[i][0]=0; batch.logits[i]=true;
    }
    llama_memory_clear(llama_get_memory(_context),true);
    int status=llama_decode(_context,batch); llama_batch_free(batch);
    if(status!=0 || _cancelled.load()) { if(error)*error=PiiFailure(@"PII 推理失败或已取消"); return nil; }
    const float *embedding=llama_get_embeddings_seq(_context,0);
    if(!embedding) { if(error)*error=PiiFailure(@"PII 未返回均值池化向量"); return nil; }
    NSMutableArray *values=[NSMutableArray arrayWithCapacity:768];
    for(int i=0;i<768;i++) {
        if(!std::isfinite(embedding[i])) { if(error)*error=PiiFailure(@"PII 返回非有限数值"); return nil; }
        [values addObject:@(embedding[i])];
    }
    // No embedding normalization: the trained linear classifier expects raw masked mean.
    return @{ @"embedding":values,@"tokens":@(count),@"inferenceSeconds":@(PiiSeconds(start)),
              @"sampledMemoryMiB":@([CSLlamaEngine residentMemoryMiB]) };
}
@end
