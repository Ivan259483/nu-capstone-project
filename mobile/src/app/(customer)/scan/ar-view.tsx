import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AiPill,
  BottomActionBar,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
  severityMeta,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import { pollAiScan3D, startAiScan3D, type AiScanDamage } from '@/services/api/aiService';
import { API_BASE_URL } from '@/config/env';

type ViewState = 'before' | 'after';

// Derive the base URL (strip /api suffix) so we can reach /ar-viewer.html
// API_BASE_URL = "http://192.168.x.x:3000/api"  →  origin = "http://192.168.x.x:3000"
const AR_VIEWER_URI = API_BASE_URL.replace(/\/api\/?$/, '') + '/ar-viewer.html';

const REPAIR_BENEFITS = [
  '✦ Surface restored to factory condition',
  '✦ Paint corrected and recoated',
  '✦ Protected with SPF ceramic coating',
];

// ─── Inject model URL and damage data into the hosted AR viewer page ───────────
// Called after the WebView page finishes loading.
// The hosted page (GET /ar-viewer.html) runs with a real HTTP origin, which is
// required so iOS WebGL is not blocked (source={{ html }} → null origin → no WebGL).
// The modelUrl is proxied through the backend so the GLB fetch originates from
// the server, bypassing Meshy CDN's CORS block on local-IP origins.
const buildInjectScript = (proxiedModelUrl: string, damages: AiScanDamage[]): string => {
  const modelMsg  = JSON.stringify(JSON.stringify({ type: 'SET_MODEL',   url: proxiedModelUrl }));
  const damageMsg = JSON.stringify(JSON.stringify({ type: 'SET_DAMAGES', damages }));
  return `(function(){
    var m=${modelMsg};
    var d=${damageMsg};
    document.dispatchEvent(new MessageEvent('message',{data:m}));
    window.dispatchEvent(new MessageEvent('message',{data:m}));
    document.dispatchEvent(new MessageEvent('message',{data:d}));
    window.dispatchEvent(new MessageEvent('message',{data:d}));
  })(); true;`;
};



// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ArViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan           = useAiScanStore((state) => state.scan);
  const modelStatus    = useAiScanStore((state) => state.modelStatus);
  const modelTaskId    = useAiScanStore((state) => state.modelTaskId);
  const modelUrl       = useAiScanStore((state) => state.modelUrl);
  const modelProgress  = useAiScanStore((state) => state.modelProgress);
  const modelMessage   = useAiScanStore((state) => state.modelMessage);

  const [viewState, setViewState]       = useState<ViewState>('before');
  const [transitioning, setTransitioning] = useState(false);
  const [modelLoaded, setModelLoaded]   = useState(false);
  const afterOpacity = useRef(new RNAnimated.Value(0)).current;
  const running      = useRef(false);
  const webviewRef   = useRef<WebView>(null);

  // ── Meshy start / poll (unchanged) ─────────────────────────────────────────
  const startOrPoll = useCallback(async () => {
    if (!scan || running.current || modelStatus === 'ready') return;
    running.current = true;
    try {
      let taskId = modelTaskId;
      if (!taskId) {
        if (!scan.scanId) {
          aiScanStore.setModelProgress({ status: 'unavailable', progress: 0, message: '3D reconstruction requires a saved AI scan ID.' });
          return;
        }
        const started = await startAiScan3D(scan.scanId);
        aiScanStore.setModelProgress(started);
        taskId = started.taskId ?? null;
        if (started.status !== 'processing' || !taskId) return;
      }
      const result = await pollAiScan3D(taskId, {
        intervalMs: 3500,
        timeoutMs: 240000,
        onProgress: (progress) => aiScanStore.setModelProgress(progress),
      });
      aiScanStore.setModelProgress(result);
      if (result.status === 'ar_ready') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : '3D reconstruction failed.';
      aiScanStore.setModelProgress({ status: 'failed', taskId: modelTaskId ?? undefined, progress: modelProgress, message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      running.current = false;
    }
  }, [modelProgress, modelStatus, modelTaskId, scan]);

  useEffect(() => { startOrPoll(); }, [startOrPoll]);

  // ── Before / After toggle ────────────────────────────────────────────────────
  const toggle = useCallback((next: ViewState) => {
    if (next === viewState || transitioning) return;
    setTransitioning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Send message to WebView
    webviewRef.current?.injectJavaScript(
      `(function(){ document.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify({ type:'SET_STATE', state:next }))}})); })(); true;`
    );
    setViewState(next);
    if (next === 'after') {
      afterOpacity.setValue(0);
      RNAnimated.timing(afterOpacity, { toValue: 1, duration: 600, delay: 420, useNativeDriver: true }).start();
    }
    setTimeout(() => setTransitioning(false), 550);
  }, [afterOpacity, transitioning, viewState]);

  // ── Trigger native AR ────────────────────────────────────────────────────────
  const activateAR = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    webviewRef.current?.injectJavaScript(
      `(function(){ document.querySelector('model-viewer')?.activateAR(); })(); true;`
    );
  }, []);

  // ── Inject model URL + damage data into the hosted page after it loads ────────
  const injectModelData = useCallback(() => {
    if (!modelUrl || !scan || !webviewRef.current) return;

    // Proxy the Meshy signed URL through our backend to avoid CORS blocks.
    // Meshy CDN rejects cross-origin requests from local IP origins; routing
    // through the backend makes the GLB fetch server-side.
    const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
    const proxiedUrl = `${apiOrigin}/api/ai/proxy-glb?url=${encodeURIComponent(modelUrl)}`;

    console.log('[AR] Injecting — proxied model URL:', proxiedUrl.slice(0, 80) + '…');
    console.log('[AR] scanId:', scan.scanId, '| damages:', scan.damages.length);

    if (!modelUrl.split('?')[0].toLowerCase().endsWith('.glb')) {
      console.warn('[AR] modelUrl is not a .glb before query string:', modelUrl);
    }

    webviewRef.current.injectJavaScript(buildInjectScript(proxiedUrl, scan.damages));
  }, [modelUrl, scan]);

  // ── WebView message handler ──────────────────────────────────────────────────
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const message = event.nativeEvent.data;
    console.log('[AR WebView]', message);
    if (message === 'MODEL_LOADED' || message === 'MODEL_SCENE_READY' || message === 'MODEL_PROGRESS_COMPLETE') {
      setModelLoaded(true);
    }
    if (message.startsWith('MODEL_ERROR:')) {
      console.warn('[AR WebView] model-viewer error:', message.slice('MODEL_ERROR:'.length));
    }
  }, []);

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (!scan) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader title="AR Repair Simulation" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={56} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>No scan loaded</Text>
          <Text style={styles.emptyText}>Run an AI inspection first.</Text>
        </View>
      </ScannerBackground>
    );
  }

  const ready      = modelStatus === 'ready' && Boolean(modelUrl);
  const unavailable = modelStatus === 'failed' || modelStatus === 'unavailable';
  const isAfter    = viewState === 'after';

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="AR Repair Simulation"
        title={isAfter ? 'After AutoSPF+ Service' : 'Current Condition'}
        onBack={() => router.back()}
        right={
          <Ionicons
            name={isAfter ? 'checkmark-circle' : 'warning'}
            size={20}
            color={isAfter ? scannerColors.green : scannerColors.orange}
          />
        }
      />
      <PipelineStepper currentIndex={3} />

      {/* ── State label — rendered ABOVE the viewer, not inside/on-top-of WebView ── */}
      {ready ? (
        <View style={[styles.stateBar, isAfter ? styles.stateBarAfter : styles.stateBarBefore]}>
          <Ionicons
            name={isAfter ? 'checkmark-circle' : 'warning'}
            size={13}
            color={isAfter ? scannerColors.green : scannerColors.orange}
          />
          <Text style={[styles.stateBarText, { color: isAfter ? scannerColors.green : scannerColors.orange }]}>
            {isAfter ? 'AFTER AUTOSPF+ SERVICE' : 'CURRENT CONDITION'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        {/* ── 3D viewer — WebView is the ONLY child of GlassPanel ── */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassPanel
            style={[styles.viewerCard, isAfter && styles.viewerCardAfter]}
            contentStyle={styles.viewerInner}
            intense
          >
            {ready ? (
              <WebView
                ref={webviewRef}
                source={{ uri: AR_VIEWER_URI }}
                style={styles.webview}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                onMessage={handleWebViewMessage}
                onLoadStart={() => console.log('[AR WebView] Load start — uri:', AR_VIEWER_URI)}
                onLoadEnd={() => {
                  console.log('[AR WebView] Load end — injecting model data');
                  injectModelData();
                }}
                onError={(e) => console.warn('[AR WebView] Error:', e.nativeEvent)}
                onHttpError={(e) => console.warn('[AR WebView] HTTP error:', e.nativeEvent.statusCode, e.nativeEvent.url)}
              />
            ) : (
              <View style={styles.loadingTwin}>
                <View style={styles.loadingIcon}>
                  <Ionicons
                    name={unavailable ? 'alert-circle-outline' : 'cube-outline'}
                    size={44}
                    color={scannerColors.orange}
                  />
                </View>
                <Text style={styles.loadingTitle}>
                  {unavailable ? '3D twin unavailable' : 'Generating digital twin'}
                </Text>
                <Text style={styles.loadingText}>
                  {modelMessage || 'Meshy is reconstructing geometry and surface textures.'}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(4, modelProgress)}%` as `${number}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(modelProgress)}%</Text>
              </View>
            )}
          </GlassPanel>
        </Animated.View>

        {/* ── Before / After toggle + View in AR ── */}
        {ready ? (
          <Animated.View entering={FadeInDown.duration(340).delay(100)}>
            <GlassPanel contentStyle={styles.toggleContent}>
              {/* DAMAGED side */}
              <Pressable
                onPress={() => toggle('before')}
                style={[styles.toggleSide, !isAfter && styles.toggleSideActive]}
              >
                {!isAfter ? <LinearGradient colors={['rgba(255,107,53,0.32)','rgba(255,107,53,0.14)']} style={StyleSheet.absoluteFill} /> : null}
                <Ionicons name="warning" size={15} color={!isAfter ? scannerColors.orange : scannerColors.textMuted} />
                <Text style={[styles.toggleText, !isAfter && { color: scannerColors.orange }]}>◀ DAMAGED</Text>
              </Pressable>

              <View style={styles.toggleDivider} />

              {/* REPAIRED side */}
              <Pressable
                onPress={() => toggle('after')}
                style={[styles.toggleSide, isAfter && styles.toggleSideActive]}
              >
                {isAfter ? <LinearGradient colors={['rgba(16,185,129,0.32)','rgba(16,185,129,0.14)']} style={StyleSheet.absoluteFill} /> : null}
                <Text style={[styles.toggleText, isAfter && { color: scannerColors.green }]}>REPAIRED ▶</Text>
                <Ionicons name="checkmark-circle" size={15} color={isAfter ? scannerColors.green : scannerColors.textMuted} />
              </Pressable>

              <View style={styles.toggleDivider} />

              {/* View in AR */}
              <Pressable onPress={activateAR} style={styles.arSide}>
                <Ionicons name="phone-portrait-outline" size={15} color={scannerColors.orange} />
                <Text style={[styles.toggleText, { color: scannerColors.orange }]}>AR</Text>
              </Pressable>
            </GlassPanel>
          </Animated.View>
        ) : null}

        {/* ── After-state benefit pills — below toggle, outside WebView ── */}
        {ready && isAfter ? (
          <RNAnimated.View style={[styles.benefitsCard, { opacity: afterOpacity }]}>
            {REPAIR_BENEFITS.map((b) => (
              <Text key={b} style={styles.benefitText}>{b}</Text>
            ))}
          </RNAnimated.View>
        ) : null}

        {/* ── Info card ── */}
        <GlassPanel>
          <View style={styles.infoHead}>
            <AiPill
              label={isAfter ? 'AutoSPF+ repair preview' : 'Damage diagnostic view'}
              icon={isAfter ? 'sparkles-outline' : 'analytics-outline'}
              color={isAfter ? scannerColors.green : scannerColors.orange}
            />
          </View>
          <Text style={styles.infoTitle}>
            {isAfter ? 'AI repair simulation active' : 'Damage markers mapped to 3D surface'}
          </Text>
          <Text style={styles.infoText}>
            {isAfter
              ? 'Same Meshy digital twin, post-service state. Brighter environment and green resolved markers simulate AutoSPF+ repair and protection work.'
              : 'Red hotspots mark AI-detected damage zones on the 3D model. Rotate and pinch to inspect. Tap REPAIRED to preview the after-service state.'}
          </Text>
          {!modelLoaded && ready ? (
            <Text style={styles.loadingHint}>
              3D model is loading in the viewer above…
            </Text>
          ) : null}
        </GlassPanel>

        {/* ── Damage strip ── */}
        <View style={styles.damageStrip}>
          {scan.damages.map((damage) => {
            const meta = severityMeta[damage.severity];
            return (
              <GlassPanel key={damage.id} style={styles.damageChip} contentStyle={styles.damageChipInner}>
                <Ionicons
                  name={isAfter ? 'checkmark-circle' : meta.icon}
                  size={16}
                  color={isAfter ? scannerColors.green : meta.color}
                />
                <Text style={styles.damageArea} numberOfLines={1}>{damage.affectedArea}</Text>
                <Text style={[styles.damageTag, { color: isAfter ? scannerColors.green : meta.color }]}>
                  {isAfter ? 'Resolved' : meta.label}
                </Text>
              </GlassPanel>
            );
          })}
        </View>
      </ScrollView>

      <BottomActionBar
        primaryLabel="Continue to Cost Estimate"
        primaryIcon="cash"
        onPrimaryPress={() => router.push('/(customer)/scan/estimate' as never)}
        secondaryLabel={unavailable ? 'Retry 3D Twin' : ready ? 'Regenerate Twin' : undefined}
        onSecondaryPress={unavailable || ready ? startOrPoll : undefined}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 14,
  },
  // ── State bar (above viewer, not inside it) ──
  stateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stateBarBefore: {
    borderBottomColor: 'rgba(255,107,53,0.30)',
    backgroundColor: 'rgba(255,107,53,0.08)',
  },
  stateBarAfter: {
    borderBottomColor: 'rgba(16,185,129,0.30)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  stateBarText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  // ── Viewer ──
  viewerCard: {
    borderColor: 'rgba(255,107,53,0.30)',
  },
  viewerCardAfter: {
    borderColor: 'rgba(16,185,129,0.36)',
  },
  viewerInner: {
    padding: 0,
    height: 440,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  // ── Loading state ──
  loadingTwin: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  loadingIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.28)',
    marginBottom: 18,
  },
  loadingTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    marginTop: 22,
  },
  progressFill: {
    height: '100%',
    backgroundColor: scannerColors.orange,
    borderRadius: 4,
  },
  progressText: {
    color: scannerColors.orange,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  // ── Toggle + AR pill ──
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
    height: 52,
  },
  toggleSide: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  toggleSideActive: {},
  arSide: {
    width: 72,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,107,53,0.10)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.14)',
  },
  toggleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: scannerColors.textMuted,
  },
  // ── Benefits card (below toggle) ──
  benefitsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
    backgroundColor: 'rgba(16,185,129,0.08)',
    padding: 14,
    gap: 6,
  },
  benefitText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // ── Info card ──
  infoHead: {
    marginBottom: 12,
  },
  infoTitle: {
    color: scannerColors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  infoText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  loadingHint: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
  },
  // ── Damage strip ──
  damageStrip: { gap: 10 },
  damageChip: { borderRadius: 20 },
  damageChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  damageArea: {
    flex: 1,
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  damageTag: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // ── Empty state ──
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 16,
  },
  emptyText: {
    color: scannerColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
});
