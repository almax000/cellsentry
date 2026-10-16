#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
// All methods except cancel/resetCancellation are called on one serial worker queue.
@interface CSLlamaEngine : NSObject
- (nullable NSDictionary<NSString *, id> *)loadModelAtPath:(NSString *)path
    error:(NSError **)error NS_SWIFT_NAME(load(path:));
- (nullable NSDictionary<NSString *, id> *)generatePrompt:(NSString *)prompt
    maximumTokens:(NSInteger)limit error:(NSError **)error NS_SWIFT_NAME(generate(prompt:maximumTokens:));
- (void)resetCancellation;
- (void)cancel;
- (void)unload;
+ (double)residentMemoryMiB;
@end
NS_ASSUME_NONNULL_END
