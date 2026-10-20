#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
// Use a single serial worker queue for load/embedding/unload. cancel is thread safe.
@interface CSPiiEngine : NSObject
- (nullable NSDictionary<NSString *, id> *)loadModelAtPath:(NSString *)path error:(NSError **)error NS_SWIFT_NAME(load(path:));
- (nullable NSDictionary<NSString *, id> *)embeddingForText:(NSString *)text error:(NSError **)error NS_SWIFT_NAME(embedding(text:));
- (void)cancel;
- (void)resetCancellation;
- (void)unload;
@end
NS_ASSUME_NONNULL_END
