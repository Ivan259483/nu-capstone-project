/**
 * Copies our patched `react-native-unity.podspec` over the npm package after install.
 * patch-package cannot diff this dependency (huge ios/ tree → ENOBUFS).
 */
const fs = require('fs');
const path = require('path');

const mobileRoot = path.join(__dirname, '..');
const src = path.join(mobileRoot, 'vendor', 'react-native-unity.podspec');
const dest = path.join(
  mobileRoot,
  'node_modules',
  '@azesmway',
  'react-native-unity',
  'react-native-unity.podspec'
);
const packageRoot = path.dirname(dest);
const localPodspec = path.join(
  mobileRoot,
  'ios',
  'Pods',
  'Local Podspecs',
  'react-native-unity.podspec.json'
);
const expectedSourceFiles = 's.source_files = "ios/RNUnityView.{h,mm}", "ios/RNUnityViewManager.mm"';
const unityIosExport = path.join(mobileRoot, 'unity', 'builds', 'ios');
const unityFrameworkSrc = path.join(unityIosExport, 'UnityFramework.framework');
const unityFrameworkDest = path.join(packageRoot, 'ios', 'UnityFramework.framework');
const unityDataSrc = path.join(unityIosExport, 'Data');
const unityDataDest = path.join(unityFrameworkDest, 'Data');
const rnUnityViewSrc = path.join(packageRoot, 'ios', 'RNUnityView.mm');
const rnUnityViewHeader = path.join(packageRoot, 'ios', 'RNUnityView.h');
const rnUnityViewManager = path.join(packageRoot, 'ios', 'RNUnityViewManager.mm');

function syncDirectory(srcDir, destDir, label) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
  console.log(`[apply-react-native-unity-podspec] synced ${label}`, destDir);
}

function copyHeaders(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;

  let copied = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyHeaders(srcPath, destDir);
    } else if (entry.isFile() && entry.name.endsWith('.h')) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(destDir, entry.name));
      copied += 1;
    }
  }
  return copied;
}

function patchRnUnityViewDiagnostics(file) {
  if (!fs.existsSync(file)) return;

  let contents = fs.readFileSync(file, 'utf8');
  const hasLegacyDiagnostics = contents.includes('[RNUnityView] sendMessageToMobileApp received: %@');
  const hasFabricDiagnostics = contents.includes('[RNUnityView] Fabric onUnityMessage event emitted.');
  if (hasLegacyDiagnostics && hasFabricDiagnostics) return;

  contents = contents.replace(
    `- (void)sendMessageToMobileApp:(NSString *)message {
    if (self.onUnityMessage) {
        NSDictionary* data = @{
            @"message": message
        };

        self.onUnityMessage(data);
    }
}`,
    `- (void)sendMessageToMobileApp:(NSString *)message {
    NSLog(@"[RNUnityView] sendMessageToMobileApp received: %@", message);
    if (self.onUnityMessage) {
        NSDictionary* data = @{
            @"message": message
        };

        self.onUnityMessage(data);
        NSLog(@"[RNUnityView] onUnityMessage dispatched to React Native.");
    } else {
        NSLog(@"[RNUnityView] Dropped Unity message because onUnityMessage is nil: %@", message);
    }
}`
  );

  contents = contents.replace(
    `        gridViewEventEmitter->onUnityMessage(event);
      }
    };`,
    `        gridViewEventEmitter->onUnityMessage(event);
        NSLog(@"[RNUnityView] Fabric onUnityMessage event emitted.");
      } else {
        NSLog(@"[RNUnityView] Dropped Unity message because Fabric event emitter is nil.");
      }
    };`
  );

  if (
    !contents.includes('[RNUnityView] sendMessageToMobileApp received: %@') ||
    !contents.includes('[RNUnityView] Fabric onUnityMessage event emitted.')
  ) {
    console.error('[apply-react-native-unity-podspec] failed to patch RNUnityView diagnostics');
    process.exit(1);
  }

  fs.writeFileSync(file, contents);
  console.log('[apply-react-native-unity-podspec] patched RNUnityView diagnostics', file);
}

function replaceRequired(contents, search, replacement, label) {
  if (!contents.includes(search)) {
    console.error(`[apply-react-native-unity-podspec] missing patch anchor: ${label}`);
    process.exit(1);
  }
  return contents.replace(search, replacement);
}

function patchRnUnityViewStartupBridge(mmFile, headerFile, managerFile) {
  if (fs.existsSync(headerFile)) {
    let header = fs.readFileSync(headerFile, 'utf8');
    if (!header.includes('pendingUnityMessages')) {
      header = header.replaceAll(
        '@property (nonatomic, strong) UIView* _Nullable uView;\n',
        '@property (nonatomic, strong) UIView* _Nullable uView;\n@property (nonatomic, strong) NSMutableArray<NSString *> *pendingUnityMessages;\n'
      );
    }
    header = header.replaceAll(
      '- (void)pauseUnity:(BOOL * _Nonnull)pause;',
      '- (void)pauseUnity:(BOOL)pause;'
    );
    fs.writeFileSync(headerFile, header);
  }

  if (fs.existsSync(managerFile)) {
    let manager = fs.readFileSync(managerFile, 'utf8');
    manager = manager.replace(
      'RCT_EXPORT_METHOD(pauseUnity:(nonnull NSNumber*) reactTag pause:(BOOL * _Nonnull)pause)',
      'RCT_EXPORT_METHOD(pauseUnity:(nonnull NSNumber*) reactTag pause:(BOOL)pause)'
    );
    manager = manager.replace(
      '[unity pauseUnity:(BOOL * _Nonnull)pause];',
      '[unity pauseUnity:pause];'
    );
    manager = manager.replace(
      '[unity pauseUnity:(BOOL * _Nonnull)false];',
      '[unity pauseUnity:false];'
    );
    fs.writeFileSync(managerFile, manager);
  }

  if (!fs.existsSync(mmFile)) return;
  let contents = fs.readFileSync(mmFile, 'utf8');
  if (contents.includes('attachUnityRootView')) return;

  contents = contents.replace(
    '#ifdef DEBUG\n#include <mach-o/ldsyms.h>\n#endif',
    '#include <mach-o/ldsyms.h>'
  );
  contents = replaceRequired(
    contents,
    'int gArgc = 1;\n',
    'int gArgc = 1;\nstatic const NSUInteger RNUnityViewMaxQueuedMessages = 32;\n',
    'RNUnityViewMaxQueuedMessages'
  );
  contents = replaceRequired(
    contents,
    `    NSBundle* bundle = [NSBundle bundleWithPath: bundlePath];
    if ([bundle isLoaded] == false) [bundle load];

    UnityFramework* ufw = [bundle.principalClass getInstance];
    if (![ufw appController])
    {
#ifdef DEBUG
      [ufw setExecuteHeader: &_mh_dylib_header];
#else
      [ufw setExecuteHeader: &_mh_execute_header];
#endif
    }

    [ufw setDataBundleId: [bundle.bundleIdentifier cStringUsingEncoding:NSUTF8StringEncoding]];

    return ufw;`,
    `    NSBundle* bundle = [NSBundle bundleWithPath: bundlePath];
    if (bundle == nil) {
        NSLog(@"[RNUnityView] UnityFramework bundle not found at path: %@", bundlePath);
        return nil;
    }
    if ([bundle isLoaded] == false && ![bundle load]) {
        NSLog(@"[RNUnityView] Failed to load UnityFramework bundle at path: %@", bundlePath);
        return nil;
    }

    UnityFramework* ufw = [bundle.principalClass getInstance];
    if (![ufw appController])
    {
#ifdef DEBUG
      [ufw setExecuteHeader: &_mh_dylib_header];
#else
      [ufw setExecuteHeader: &_mh_execute_header];
#endif
    }

    [ufw setDataBundleId: [bundle.bundleIdentifier cStringUsingEncoding:NSUTF8StringEncoding]];
    NSLog(@"[RNUnityView] UnityFramework loaded. dataBundleId=%@", bundle.bundleIdentifier);

    return ufw;`,
    'UnityFrameworkLoad body'
  );
  contents = replaceRequired(
    contents,
    `- (bool)unityIsInitialized {
    return [self ufw] && [[self ufw] appController];
}

- (void)initUnityModule {`,
    `- (bool)unityIsInitialized {
    return [self ufw] && [[self ufw] appController];
}

- (void)queueUnityMessage:(NSString *)message reason:(NSString *)reason {
    if (message == nil) {
        return;
    }
    if (self.pendingUnityMessages == nil) {
        self.pendingUnityMessages = [NSMutableArray new];
    }
    if (self.pendingUnityMessages.count >= RNUnityViewMaxQueuedMessages) {
        [self.pendingUnityMessages removeObjectAtIndex:0];
    }
    [self.pendingUnityMessages addObject:message];
    NSLog(@"[RNUnityView] Queued Unity message because %@ (queue=%lu): %@",
          reason,
          (unsigned long)self.pendingUnityMessages.count,
          message);
}

- (void)flushQueuedUnityMessages {
    if (self.pendingUnityMessages.count == 0 || self.onUnityMessage == nil) {
        return;
    }

    NSArray<NSString *> *messages = [self.pendingUnityMessages copy];
    [self.pendingUnityMessages removeAllObjects];
    for (NSString *message in messages) {
        NSLog(@"[RNUnityView] Flushing queued Unity message: %@", message);
        self.onUnityMessage(@{ @"message": message });
    }
}

- (void)registerCurrentViewForNativeCalls {
    Class frameworkApi = NSClassFromString(@"FrameworkLibAPI");
    if (frameworkApi == nil) {
        NSLog(@"[RNUnityView] FrameworkLibAPI is unavailable; Unity -> RN messages cannot register yet.");
        return;
    }
    [frameworkApi registerAPIforNativeCalls:self];
}

- (void)attachUnityRootView {
    if (![self unityIsInitialized]) {
        return;
    }

    UIView *rootView = self.ufw.appController.rootView;
    if (rootView == nil) {
        NSLog(@"[RNUnityView] Unity appController exists but rootView is nil.");
        return;
    }

    rootView.frame = self.bounds;
    rootView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

    if (rootView.superview != self) {
        [rootView removeFromSuperview];
        [self insertSubview:rootView atIndex:0];
        NSLog(@"[RNUnityView] Attached Unity rootView to RNUnityView. bounds=%@",
              NSStringFromCGRect(self.bounds));
    }

    [self registerCurrentViewForNativeCalls];
    [[self ufw] pause:false];
}

- (void)initUnityModule {`,
    'RNUnityView helper methods'
  );
  contents = contents.replace(
    `        if([self unityIsInitialized]) {
            return;
        }

        [self setUfw: UnityFrameworkLoad()];
        [[self ufw] registerFrameworkListener: self];`,
    `        if([self unityIsInitialized]) {
            NSLog(@"[RNUnityView] Unity already initialized; re-registering current view and attaching rootView.");
            [self attachUnityRootView];
            return;
        }

        NSLog(@"[RNUnityView] Initializing Unity module.");
        [self setUfw: UnityFrameworkLoad()];
        if ([self ufw] == nil) {
            return;
        }
        [self registerCurrentViewForNativeCalls];
        [[self ufw] registerFrameworkListener: self];`
  );
  contents = contents.replace(
    `        [[self ufw] runEmbeddedWithArgc: gArgc argv: array appLaunchOpts: appLaunchOpts];
        [[self ufw] appController].quitHandler = ^(){ NSLog(@"AppController.quitHandler called"); };
        [self.ufw.appController.rootView removeFromSuperview];

        if (@available(iOS 13.0, *)) {
            [[[[self ufw] appController] window] setWindowScene: nil];
        } else {
            [[[[self ufw] appController] window] setScreen: nil];
        }

        [[[[self ufw] appController] window] addSubview: self.ufw.appController.rootView];
        [[[[self ufw] appController] window] makeKeyAndVisible];
        [[[[[[self ufw] appController] window] rootViewController] view] setNeedsLayout];

        [NSClassFromString(@"FrameworkLibAPI") registerAPIforNativeCalls:self];`,
    `        NSLog(@"[RNUnityView] Running Unity embedded.");
        [[self ufw] runEmbeddedWithArgc: gArgc argv: array appLaunchOpts: appLaunchOpts];
        [[self ufw] appController].quitHandler = ^(){ NSLog(@"AppController.quitHandler called"); };
        [self.ufw.appController.rootView removeFromSuperview];

        [self attachUnityRootView];`
  );
  contents = contents.replace(
    `   if([self unityIsInitialized]) {
      self.ufw.appController.rootView.frame = self.bounds;
      [self addSubview:self.ufw.appController.rootView];
   }`,
    `   if([self unityIsInitialized]) {
      [self attachUnityRootView];
   } else if (self.window != nil) {
      [self initUnityModule];
   }`
  );
  contents = contents.replaceAll(
    '- (void)pauseUnity:(BOOL * _Nonnull)pause',
    '- (void)pauseUnity:(BOOL)pause'
  );
  contents = contents.replace(
    '        NSLog(@"[RNUnityView] Dropped Unity message because onUnityMessage is nil: %@", message);',
    '        [self queueUnityMessage:message reason:@"onUnityMessage is nil"];'
  );
  contents = contents.replace(
    `- (void)postMessage:(NSString *)gameObject methodName:(NSString*)methodName message:(NSString*) message {
    dispatch_async(dispatch_get_main_queue(), ^{
        [[self ufw] sendMessageToGOWithName:[gameObject UTF8String] functionName:[methodName UTF8String] message:[message UTF8String]];
    });
}`,
    `- (void)postMessage:(NSString *)gameObject methodName:(NSString*)methodName message:(NSString*) message {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (![self unityIsInitialized]) {
            [self initUnityModule];
        }
        if (![self unityIsInitialized]) {
            NSLog(@"[RNUnityView] postMessage dropped because Unity is not initialized: %@.%@",
                  gameObject,
                  methodName);
            return;
        }
        [self registerCurrentViewForNativeCalls];
        [[self ufw] sendMessageToGOWithName:[gameObject UTF8String] functionName:[methodName UTF8String] message:[message UTF8String]];
    });
}`
  );
  contents = contents.replace(
    `  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const RNUnityViewProps>();`,
    `  if (self = [super initWithFrame:frame]) {
    self.pendingUnityMessages = [NSMutableArray new];
    static const auto defaultProps = std::make_shared<const RNUnityViewProps>();`
  );
  contents = contents.replace(
    `      } else {
        NSLog(@"[RNUnityView] Dropped Unity message because Fabric event emitter is nil.");
      }
    };
  }

  return self;
}

- (void)updateEventEmitter:(EventEmitter::Shared const &)eventEmitter {
    [super updateEventEmitter:eventEmitter];
}`,
    `      } else {
        NSString *message = [data valueForKey:@"message"];
        [self queueUnityMessage:message reason:@"Fabric event emitter is nil"];
      }
    };

    dispatch_async(dispatch_get_main_queue(), ^{
      [self initUnityModule];
    });
  }

  return self;
}

- (void)updateEventEmitter:(EventEmitter::Shared const &)eventEmitter {
    [super updateEventEmitter:eventEmitter];
    dispatch_async(dispatch_get_main_queue(), ^{
      [self flushQueuedUnityMessages];
    });
}`
  );
  contents = contents.replace(
    `    if (![self unityIsInitialized]) {
      [self initUnityModule];
    }

    [super updateProps:props oldProps:oldProps];`,
    `    if (![self unityIsInitialized]) {
      [self initUnityModule];
    } else {
      [self attachUnityRootView];
    }

    [super updateProps:props oldProps:oldProps];`
  );
  contents = contents.replace(
    `    if (self) {
        [self initUnityModule];
    }`,
    `    if (self) {
        self.pendingUnityMessages = [NSMutableArray new];
        [self initUnityModule];
    }`
  );

  if (!contents.includes('attachUnityRootView') || !contents.includes('Queued Unity message')) {
    console.error('[apply-react-native-unity-podspec] failed to patch RNUnityView startup bridge');
    process.exit(1);
  }

  fs.writeFileSync(mmFile, contents);
  console.log('[apply-react-native-unity-podspec] patched RNUnityView startup bridge', mmFile);
}

if (!fs.existsSync(path.dirname(dest))) {
  process.exit(0);
}
if (!fs.existsSync(src)) {
  console.error('[apply-react-native-unity-podspec] missing', src);
  process.exit(1);
}

fs.copyFileSync(src, dest);
const patched = fs.readFileSync(dest, 'utf8');
if (!patched.includes(expectedSourceFiles)) {
  console.error('[apply-react-native-unity-podspec] patched podspec is missing the narrowed source_files line');
  process.exit(1);
}
patchRnUnityViewDiagnostics(rnUnityViewSrc);
patchRnUnityViewStartupBridge(rnUnityViewSrc, rnUnityViewHeader, rnUnityViewManager);

if (fs.existsSync(path.join(unityFrameworkSrc, 'UnityFramework'))) {
  syncDirectory(unityFrameworkSrc, unityFrameworkDest, 'UnityFramework.framework');
} else if (!fs.existsSync(path.join(unityFrameworkDest, 'UnityFramework'))) {
  console.warn(
    '[apply-react-native-unity-podspec] UnityFramework binary is not available yet; export/build Unity before running the iOS app.'
  );
}

if (fs.existsSync(path.join(unityDataSrc, 'level0'))) {
  fs.rmSync(path.join(packageRoot, 'ios', 'Data'), { recursive: true, force: true });
  syncDirectory(unityDataSrc, unityDataDest, 'Unity Data');
} else if (!fs.existsSync(path.join(unityDataDest, 'level0'))) {
  console.warn(
    '[apply-react-native-unity-podspec] Unity player Data is not available yet; Unity can mount but render black without it.'
  );
}

const frameworkHeadersDest = path.join(unityFrameworkDest, 'Headers');
const copiedHeaders =
  copyHeaders(path.join(unityIosExport, 'Classes'), frameworkHeadersDest) +
  copyHeaders(path.join(unityIosExport, 'Libraries', 'Plugins', 'iOS'), frameworkHeadersDest);
if (copiedHeaders > 0) {
  console.log(`[apply-react-native-unity-podspec] synced ${copiedHeaders} Unity public headers`, frameworkHeadersDest);
}

if (fs.existsSync(localPodspec)) {
  fs.rmSync(localPodspec);
  console.log('[apply-react-native-unity-podspec] removed stale CocoaPods local podspec', localPodspec);
}

console.log('[apply-react-native-unity-podspec] wrote', dest);
