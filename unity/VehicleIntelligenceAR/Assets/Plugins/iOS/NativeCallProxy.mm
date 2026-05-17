#import <Foundation/Foundation.h>
#import "NativeCallProxy.h"

@implementation FrameworkLibAPI

static id<NativeCallsProtocol> api = NULL;
static NSMutableArray<NSString *> *pendingMessages = nil;

+(void) registerAPIforNativeCalls:(id<NativeCallsProtocol>) aApi
{
    NSArray<NSString *> *drain = nil;
    id<NativeCallsProtocol> registered = aApi;
    @synchronized ([FrameworkLibAPI class]) {
        api = registered;
        NSLog(@"[NativeCallProxy] Registered NativeCallsProtocol API: %@", api);
        if (pendingMessages.count > 0) {
            drain = [pendingMessages copy];
            [pendingMessages removeAllObjects];
        }
    }
    if (drain != nil) {
        for (NSString *payload in drain) {
            dispatch_async(dispatch_get_main_queue(), ^{
                NSLog(@"[NativeCallProxy] Flushing queued Unity -> React Native: %@", payload);
                [registered sendMessageToMobileApp:payload];
            });
        }
    }
}

@end

extern "C"
{
    __attribute__ ((visibility("default")))
    void sendMessageToMobileApp(const char* message)
    {
        NSString *payload = message != NULL ? [NSString stringWithUTF8String:message] : @"";
        id<NativeCallsProtocol> target = nil;
        @synchronized ([FrameworkLibAPI class]) {
            target = api;
            if (target == nil) {
                if (pendingMessages == nil) {
                    pendingMessages = [[NSMutableArray alloc] init];
                }
                [pendingMessages addObject:payload];
                NSString *preview = payload.length > 160 ? [payload substringToIndex:160] : payload;
                NSLog(@"[NativeCallProxy] Queued Unity message before API registration (queue=%lu): %@…",
                      (unsigned long)pendingMessages.count, preview);
                return;
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            NSLog(@"[NativeCallProxy] Unity -> React Native: %@", payload);
            [target sendMessageToMobileApp:payload];
        });
    }
}
