import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Linking,
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
import * as WebBrowser from 'expo-web-browser';
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
import { pollAiScan3D, startAiScan3D } from '@/services/api/aiService';
import { API_BASE_URL } from '@/config/env';

type ViewState = 'before' | 'after';

const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
const WEBAR_PAGE_URI = `${API_ORIGIN}/webar/index.html`;

const buildProxiedGlbUri = (url: string | null | undefined) => {
  const clean = String(url || '').trim();
  if (!clean) return undefined;
  if (!/^https?:\/\//i.test(clean)) return clean;
  if (clean.includes('/api/ai/proxy-glb')) return clean;

  try {
    const parsed = new URL(clean);
    const apiParsed = new URL(API_BASE_URL);
    if (parsed.origin === apiParsed.origin) return clean;
  } catch {
    return clean;
  }

  return `${API_BASE_URL}/ai/proxy-glb?url=${encodeURIComponent(clean)}`;
};

const REPAIR_BENEFITS = [
  'Surface restored to factory condition',
  'Paint corrected and recoated',
  'Protected with SPF ceramic coating',
];

const buildWebArUri = (scanId: string | null | undefined, embed: boolean) => {
  const params = new URLSearchParams();
  if (scanId) params.set('scanId', scanId);
  if (embed) params.set('embed', '1');
  const query = params.toString();
  return query ? `${WEBAR_PAGE_URI}?${query}` : WEBAR_PAGE_URI;
};

const buildWebViewMessageScript = (payload: Record<string, unknown>) => {
  const serialized = JSON.stringify(JSON.stringify(payload));
  return `(function(){
    var data=${serialized};
    document.dispatchEvent(new MessageEvent('message',{data:data}));
    window.dispatchEvent(new MessageEvent('message',{data:data}));
  })(); true;`;
};

/** Builds a self-contained Model Viewer HTML page to embed inline in the WebView.
 * Option A: switches model-viewer src between GLBs; uses CSS tint for "after" state.
 * No Three.js baking — the backend webar/index.html handles that for the browser flow. */
const buildInlineWebArHtml = (
  modelUrl: string,
  repairedModelUrl: string,
  damages: {
    id: string;
    type: string;
    severity: string;
    affectedArea: string;
    confidence: number;
    coordinates: { x: number; y: number; width: number; height: number };
  }[]
): string => {
  const safeModel = modelUrl.replace(/"/g, '%22');
  const safeRepaired = (repairedModelUrl || modelUrl).replace(/"/g, '%22');
  // Serialize damage data; escape </script> to prevent HTML injection
  const safeDamages = JSON.stringify(
    damages.map((d) => ({
      id: d.id,
      type: d.type,
      severity: String(d.severity),
      affectedArea: d.affectedArea,
      confidence: d.confidence,
      coordinates: d.coordinates,
    }))
  ).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>AutoSPF+ AR</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#050506;color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  -webkit-tap-highlight-color:transparent;}
model-viewer{position:fixed;inset:0;width:100%;height:100%;
  background:radial-gradient(circle at 50% 46%,rgba(255,255,255,.06),transparent 30%),
             radial-gradient(circle at 50% 86%,rgba(249,115,22,.10),transparent 34%),#050506;
  --poster-color:#050506;--progress-bar-color:#f97316;--progress-mask:rgba(5,5,6,.88);}
#arBtn{
  position:absolute;
  bottom:max(24px,env(safe-area-inset-bottom,24px));
  left:50%;transform:translateX(-50%);
  padding:0 32px;height:52px;border-radius:26px;
  background:linear-gradient(135deg,#f97316,#fb923c);
  color:#fff;font-size:13px;font-weight:900;letter-spacing:.6px;
  text-transform:uppercase;border:none;cursor:pointer;
  box-shadow:0 8px 32px rgba(249,115,22,.40),inset 0 1px 0 rgba(255,255,255,.22);
  transition:opacity .2s,transform .15s;white-space:nowrap;}
#arBtn:active{opacity:.85;transform:translateX(-50%) scale(.97);}
#arBtn[disabled]{opacity:.40;cursor:not-allowed;}
/* tint must be below AR button (z-index 6) but above model-viewer canvas */
#tint{position:fixed;inset:0;z-index:3;pointer-events:none;
  background:rgba(16,185,129,.15);opacity:0;transition:opacity .55s ease;}
#pills{position:fixed;z-index:10;
  top:max(12px,env(safe-area-inset-top,12px));
  left:12px;right:12px;
  display:flex;flex-wrap:wrap;gap:6px;pointer-events:none;}
.pill{display:flex;align-items:center;gap:6px;padding:5px 10px;
  border-radius:999px;border:1px solid rgba(255,255,255,.12);
  background:rgba(8,8,10,.82);backdrop-filter:blur(14px);
  font-size:11px;font-weight:800;white-space:nowrap;transition:all .35s;}
.dot{width:7px;height:7px;border-radius:50%;}
#loading{position:fixed;inset:0;z-index:20;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#050506;gap:18px;}
.ring{width:56px;height:56px;border-radius:50%;
  border:3px solid rgba(249,115,22,.20);border-top-color:#f97316;
  animation:spin .9s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.lt{color:rgba(255,255,255,.58);font-size:13px;font-weight:700;}
.ls{color:#f97316;font-size:11px;font-weight:800;margin-top:2px;}
#errBox{position:fixed;inset:0;z-index:20;
  display:none;flex-direction:column;align-items:center;justify-content:center;
  background:#050506;padding:28px;text-align:center;gap:12px;}
.ei{font-size:44px;}.et{font-size:17px;font-weight:900;color:#fca5a5;}
.em{font-size:13px;color:rgba(255,255,255,.55);font-weight:600;line-height:1.5;}
/* Hide AR button when device has no AR support */
/* ar-btn always visible once model loads — Quick Look hides it natively if unsupported */
</style>
</head>
<body>
<model-viewer id="mv"
  src="${safeModel}"
  ios-src="${safeModel}"
  alt="AutoSPF+ vehicle 3D model"
  ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" ar-scale="auto"
  camera-controls touch-action="pan-y" interaction-prompt="auto"
  auto-rotate auto-rotate-delay="1800" rotation-per-second="12deg"
  shadow-intensity="1.35" shadow-softness="0.78"
  environment-image="neutral" exposure="1.05"
  camera-orbit="35deg 64deg auto" field-of-view="32deg"
  loading="eager" reveal="auto">
  <button slot="ar-button" id="arBtn" type="button">📱 View in AR ↗</button>
</model-viewer>
<div id="tint"></div>
<div id="pills"></div>
<div id="loading"><div class="ring"></div><div class="lt">Loading 3D model…</div><div class="ls" id="prog">0%</div></div>
<div id="errBox"><div class="ei">⚠️</div><div class="et">Model could not load</div><div class="em">The 3D model could not be fetched. Check your connection and try again.</div></div>
<script>
(function(){
  var MODEL_URL=${JSON.stringify(safeModel)};
  var REPAIRED_URL=${JSON.stringify(safeRepaired)};
  var DAMAGES=${safeDamages};
  var SEV={high:'#ef4444',medium:'#f97316',low:'#10b981'};
  var mode='before';
  var mv=document.getElementById('mv');
  var tint=document.getElementById('tint');
  var pills=document.getElementById('pills');
  var loading=document.getElementById('loading');
  var errBox=document.getElementById('errBox');
  var prog=document.getElementById('prog');

  function post(d){
    try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));}catch(e){}
  }

  function renderPills(m){
    pills.innerHTML='';
    if(!Array.isArray(DAMAGES)||!DAMAGES.length)return;
    DAMAGES.forEach(function(d){
      var pill=document.createElement('div');pill.className='pill';
      var dot=document.createElement('span');dot.className='dot';
      var c=m==='after'?'#10b981':(SEV[d.severity]||SEV.medium);
      dot.style.background=c;dot.style.boxShadow='0 0 10px '+c;
      var lbl=document.createElement('span');lbl.style.color=c;
      lbl.textContent=(m==='after'?'✓ ':'')+String(d.affectedArea||d.type||'Damage');
      pill.appendChild(dot);pill.appendChild(lbl);pills.appendChild(pill);
    });
  }

  function applyMode(m){
    mode=m==='after'?'after':'before';
    var src=mode==='after'?REPAIRED_URL:MODEL_URL;
    if(mv.getAttribute('src')!==src)mv.setAttribute('src',src);
    tint.style.opacity=mode==='after'?'1':'0';
    // exposure is a reflected attribute on <model-viewer>, not a plain JS property
    mv.setAttribute('exposure',mode==='after'?'1.18':'1.05');
    renderPills(mode);
    post({type:'VARIANT_READY',mode:mode,baked:false});
  }

  function handleMsg(raw){
    var msg;
    try{msg=JSON.parse(typeof raw==='string'?raw:JSON.stringify(raw));}catch(e){return;}
    if(!msg||typeof msg!=='object')return;
    if(msg.type==='WEBAR_INIT'){
      var p=msg.payload||msg;
      if(p.modelUrl){MODEL_URL=p.modelUrl;REPAIRED_URL=p.repairedModelUrl||p.modelUrl;}
      if(Array.isArray(p.damages))DAMAGES=p.damages;
      applyMode(mode);
      post({type:'WEBAR_INIT_APPLIED',scanId:p.scanId||null});
    }
    if(msg.type==='SET_STATE')applyMode(msg.state);
  }

  window.addEventListener('message',function(e){handleMsg(e.data);});
  document.addEventListener('message',function(e){handleMsg(e.data);});

  mv.addEventListener('progress',function(e){
    var p=e.detail&&e.detail.totalProgress?Math.round(e.detail.totalProgress*100):0;
    if(prog)prog.textContent=p+'%';
  });

  mv.addEventListener('load',function(){
    loading.style.display='none';
    post({type:'MODEL_LOADED',modelUrl:MODEL_URL,baked:false});
  });

  mv.addEventListener('error',function(){
    loading.style.display='none';
    errBox.style.display='flex';
    post({type:'WEBAR_ERROR',message:'The 3D model could not be loaded.'});
  });

  mv.addEventListener('ar-status',function(e){
    var s=e.detail&&e.detail.status?e.detail.status:'';
    if(s==='session-started')post({type:'AR_STARTED',mode:mode});
    if(s==='failed'){
      // Quick Look failed via slot — try programmatic <a rel="ar"> (required for some WKWebView configs)
      var glb=mv.getAttribute('src')||'';
      if(glb){
        var a=document.createElement('a');
        a.setAttribute('rel','ar');
        a.href=glb;
        var img=document.createElement('img');
        img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.width=1;img.height=1;
        a.appendChild(img);
        document.body.appendChild(a);
        a.click();
        setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);},500);
      }
      post({type:'WEBAR_ERROR',message:'AR launched via fallback link.'});
    }
    if(s==='not-presenting'){
      post({type:'AR_ENDED',mode:mode});
    }
  });

  renderPills('before');
  post({type:'WEBAR_READY'});
})();
<\/script>
</body>
</html>`;
};

export default function ArViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const modelStatus = useAiScanStore((state) => state.modelStatus);
  const modelTaskId = useAiScanStore((state) => state.modelTaskId);
  const modelUrl = useAiScanStore((state) => state.modelUrl);
  const repairedModelUrl = useAiScanStore((state) => state.repairedModelUrl);
  const modelProgress = useAiScanStore((state) => state.modelProgress);
  const modelMessage = useAiScanStore((state) => state.modelMessage);
  const capturedImages = useAiScanStore((state) => state.capturedImages);

  const [viewState, setViewState] = useState<ViewState>('before');
  const [transitioning, setTransitioning] = useState(false);
  const [webArLoaded, setWebArLoaded] = useState(false);
  const [webArError, setWebArError] = useState<string | null>(null);
  const afterOpacity = useRef(new RNAnimated.Value(0)).current;
  const running = useRef(false);
  const webviewRef = useRef<WebView>(null);

  const ready = modelStatus === 'ready' && Boolean(modelUrl);
  const unavailable = modelStatus === 'failed' || modelStatus === 'unavailable';
  /** Only show Model Viewer AR after Meshy returns a real GLB. */
  const showEmbeddedWebAr = ready;
  /** True when we have a real GLB → render the self-contained inline Model Viewer. */
  const useInlineViewer = ready && Boolean(modelUrl);
  const isAfter = viewState === 'after';
  const webArEmbedUri = useMemo(() => buildWebArUri(scan?.scanId, true), [scan?.scanId]);
  const webArBrowserUri = useMemo(() => {
    if (ready && modelUrl) {
      // Use the raw GLB URL from Meshy — real Safari can fetch it without CORS issues.
      // ar.html reads ?model= and sets it as model-viewer src directly.
      return `${API_ORIGIN}/ar.html?model=${encodeURIComponent(modelUrl)}`;
    }
    return buildWebArUri(scan?.scanId, false);
  }, [modelUrl, ready, scan?.scanId]);
  const webArInitPayload = useMemo(
    () => ({
      type: 'WEBAR_INIT',
      payload: {
        scanId: scan?.scanId ?? null,
        title: 'AutoSPF+ repair simulation',
        modelStatus,
        modelUrl: ready ? buildProxiedGlbUri(modelUrl) : undefined,
        repairedModelUrl: ready ? buildProxiedGlbUri(repairedModelUrl || modelUrl) : undefined,
        damages: scan?.damages ?? [],
        summary: scan?.summary ?? '',
      },
    }),
    [modelStatus, modelUrl, ready, repairedModelUrl, scan?.damages, scan?.scanId, scan?.summary]
  );

  /** Self-contained inline HTML — rebuilt only when GLB URLs or damages change.
   * Deps use stable primitives (ready, modelUrl) not derived booleans to avoid
   * useMemo invalidation on every render. */
  const inlineHtml = useMemo(() => {
    if (!ready || !modelUrl) return '';
    const proxiedModel = buildProxiedGlbUri(modelUrl) ?? '';
    const proxiedRepaired = buildProxiedGlbUri(repairedModelUrl || modelUrl) ?? proxiedModel;
    return buildInlineWebArHtml(proxiedModel, proxiedRepaired, scan?.damages ?? []);
  }, [ready, modelUrl, repairedModelUrl, scan?.damages]);

  // Step indices: 0 Scan, 1 Detect, 2 3D, 3 AR, … — keep "3D" active until Meshy finishes or definitively fails.
  const pipelineStepIndex = useMemo(() => {
    if (!scan) return 0;
    return ready ? 3 : 2;
  }, [scan, ready]);
  const webArSessionKey = `${scan?.scanId ?? 'demo'}:${useInlineViewer ? 'inline' : 'waiting'}`;

  const startOrPoll = useCallback(
    async (force = false) => {
      if (!scan || running.current || modelStatus === 'ready') return;
      if (!force && (modelStatus === 'failed' || modelStatus === 'unavailable')) return;

      running.current = true;
      setWebArError(null);
      try {
        let taskId = force ? null : modelTaskId;
        if (!taskId) {
          if (!scan.scanId && capturedImages.length === 0) {
            aiScanStore.setModelProgress({
              status: 'unavailable',
              progress: 0,
              message: '3D reconstruction requires a saved scan or captured vehicle photo.',
            });
            return;
          }
          const started = await startAiScan3D(scan.scanId || '', capturedImages);
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
        if (result.status === 'ar_ready') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '3D reconstruction failed.';
        aiScanStore.setModelProgress({
          status: 'failed',
          taskId: modelTaskId ?? undefined,
          progress: modelProgress,
          message,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        running.current = false;
      }
    },
    [capturedImages, modelProgress, modelStatus, modelTaskId, scan]
  );

  useEffect(() => {
    startOrPoll();
  }, [startOrPoll]);

  // Reset loaded/error state whenever the viewer key changes so stale
  // WEBAR_READY messages are never reused across scans or model states.
  useEffect(() => {
    setWebArLoaded(false);
    setWebArError(null);
  }, [webArSessionKey]);

  const sendWebArInit = useCallback(() => {
    if (!scan || !showEmbeddedWebAr) return;
    webviewRef.current?.injectJavaScript(buildWebViewMessageScript(webArInitPayload));
  }, [scan, showEmbeddedWebAr, webArInitPayload]);

  useEffect(() => {
    if (!webArLoaded) return;
    sendWebArInit();
  }, [sendWebArInit, webArLoaded]);

  useEffect(() => {
    if (!webArLoaded || !showEmbeddedWebAr) return;
    webviewRef.current?.injectJavaScript(
      buildWebViewMessageScript({ type: 'SET_STATE', state: viewState })
    );
  }, [showEmbeddedWebAr, viewState, webArLoaded]);

  const toggle = useCallback(
    (next: ViewState) => {
      if (next === viewState || transitioning) return;
      setTransitioning(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      webviewRef.current?.injectJavaScript(
        buildWebViewMessageScript({ type: 'SET_STATE', state: next })
      );
      setViewState(next);
      if (next === 'after') {
        afterOpacity.setValue(0);
        RNAnimated.timing(afterOpacity, {
          toValue: 1,
          duration: 600,
          delay: 250,
          useNativeDriver: true,
        }).start();
      }
      setTimeout(() => setTransitioning(false), 550);
    },
    [afterOpacity, transitioning, viewState]
  );

  const openWebArInBrowser = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      // ── Open the dedicated ar.html page in Safari ──
      // iOS Quick Look requires a direct accessible GLB URL, not a proxied download,
      // so we use the standalone AR HTML page hosted on Render, which uses <model-viewer>.
      const arHtmlUrl = `${API_BASE_URL.replace('/api', '')}/ar.html?model=${encodeURIComponent(modelUrl || '')}`;
      await Linking.openURL(arHtmlUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open browser.';
      setWebArError(message);
    }
  }, [modelUrl]);

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const raw = event.nativeEvent.data;
      console.log('[WebAR WebView]', raw);
      try {
        const message = JSON.parse(raw) as { type?: string; message?: string };
        if (
          message.type === 'WEBAR_READY' ||
          message.type === 'MODEL_LOADED' ||
          message.type === 'VARIANT_READY' ||
          message.type === 'WEBAR_INIT_APPLIED'
        ) {
          setWebArLoaded(true);
          setWebArError(null);
        }
        if (message.type === 'WEBAR_READY') {
          // Small delay so the WebView JS event loop settles before injection
          setTimeout(sendWebArInit, 80);
        }
        if (message.type === 'AR_STARTED') {
          setWebArLoaded(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        if (message.type === 'AR_ENDED') {
          // AR session dismissed — nothing to do, just log
          console.log('[WebAR] AR session ended normally');
        }
        if (message.type === 'WEBAR_ERROR') {
          setWebArError(message.message || 'Model Viewer AR could not prepare this model.');
        }
      } catch {
        if (raw.startsWith('MODEL_ERROR:')) {
          setWebArError('The vehicle model could not be loaded.');
        }
      }
    },
    [sendWebArInit]
  );

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

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow={showEmbeddedWebAr ? 'Model Viewer AR' : '3D Vehicle Model'}
        title={showEmbeddedWebAr ? (isAfter ? 'After AutoSPF+ Service' : 'Current Condition') : 'Preparing AR'}
        onBack={() => router.back()}
        right={
          <Ionicons
            name={showEmbeddedWebAr ? 'aperture-outline' : 'cube-outline'}
            size={20}
            color={showEmbeddedWebAr ? scannerColors.green : scannerColors.orange}
          />
        }
      />
      <PipelineStepper currentIndex={pipelineStepIndex} />

      {showEmbeddedWebAr ? (
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
        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassPanel
            style={[styles.viewerCard, isAfter && styles.viewerCardAfter]}
            contentStyle={styles.viewerInner}
            intense
          >
            {showEmbeddedWebAr ? (
              <WebView
                key={webArSessionKey}
                ref={webviewRef}
                source={
                  useInlineViewer && inlineHtml
                    ? { html: inlineHtml, baseUrl: API_ORIGIN }
                    : { uri: webArEmbedUri }
                }
                style={styles.webview}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                // allowsLinkPreview MUST be true (default) for iOS Quick Look AR to launch.
                // Setting it to false silently blocks the Quick Look AR trigger in WKWebView.
                allowsLinkPreview
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                sharedCookiesEnabled
                // Modern Safari UA so model-viewer CDN serves the correct ES-module bundle.
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
                onMessage={handleWebViewMessage}
                onLoadStart={() => console.log('[WebAR] Load start — inline:', useInlineViewer)}
                onLoadEnd={() => {
                  console.log('[WebAR] Load end — inline:', useInlineViewer);
                  // For URI-based pages, send init manually on load end.
                  // Inline HTML posts WEBAR_READY itself, which triggers sendWebArInit.
                  if (!useInlineViewer) sendWebArInit();
                }}
                onError={(e) => {
                  console.warn('[WebAR] Error:', e.nativeEvent);
                  setWebArError('AR viewer failed to load. Try opening in the browser.');
                }}
                onHttpError={(e) => {
                  console.warn('[WebAR] HTTP error:', e.nativeEvent.statusCode, e.nativeEvent.url);
                  setWebArError('AR session returned an HTTP error.');
                }}
              />
            ) : (
              <View style={styles.loadingTwin}>
                <View style={styles.loadingIcon}>
                  <Ionicons name="cube-outline" size={44} color={scannerColors.orange} />
                </View>
                <Text style={styles.loadingTitle}>Generating digital twin</Text>
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

        {showEmbeddedWebAr ? (
          <Animated.View entering={FadeInDown.duration(340).delay(100)}>
            <GlassPanel contentStyle={styles.toggleContent}>
              <Pressable
                onPress={() => toggle('before')}
                style={[styles.toggleSide, !isAfter && styles.toggleSideActive]}
              >
                {!isAfter ? (
                  <LinearGradient
                    colors={['rgba(255,107,53,0.32)', 'rgba(255,107,53,0.14)']}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Ionicons
                  name="warning"
                  size={15}
                  color={!isAfter ? scannerColors.orange : scannerColors.textMuted}
                />
                <Text style={[styles.toggleText, !isAfter && { color: scannerColors.orange }]}>
                  DAMAGED
                </Text>
              </Pressable>

              <View style={styles.toggleDivider} />

              <Pressable
                onPress={() => toggle('after')}
                style={[styles.toggleSide, isAfter && styles.toggleSideActive]}
              >
                {isAfter ? (
                  <LinearGradient
                    colors={['rgba(16,185,129,0.32)', 'rgba(16,185,129,0.14)']}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Text style={[styles.toggleText, isAfter && { color: scannerColors.green }]}>
                  REPAIRED
                </Text>
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color={isAfter ? scannerColors.green : scannerColors.textMuted}
                />
              </Pressable>

              <View style={styles.toggleDivider} />

              <Pressable onPress={openWebArInBrowser} style={styles.browserSide}>
                <Ionicons name="open-outline" size={15} color={scannerColors.orange} />
                <Text style={[styles.toggleText, { color: scannerColors.orange }]}>BROWSER</Text>
              </Pressable>
            </GlassPanel>
          </Animated.View>
        ) : null}

        {showEmbeddedWebAr && isAfter ? (
          <RNAnimated.View style={[styles.benefitsCard, { opacity: afterOpacity }]}>
            {REPAIR_BENEFITS.map((benefit) => (
              <Text key={benefit} style={styles.benefitText}>{benefit}</Text>
            ))}
          </RNAnimated.View>
        ) : null}

        <GlassPanel>
          <View style={styles.infoHead}>
            <AiPill
              label={
                isAfter
                  ? 'AutoSPF+ repair preview'
                  : ready
                    ? 'Model Viewer AR'
                    : 'Fallback AR model'
              }
              icon={isAfter ? 'sparkles-outline' : 'aperture-outline'}
              color={isAfter ? scannerColors.green : scannerColors.orange}
            />
          </View>
          <Text style={styles.infoTitle}>
            {showEmbeddedWebAr
              ? isAfter
                ? 'Browser repair simulation active'
                : 'Vehicle model ready for Google Scene Viewer or iOS Quick Look'
              : 'Preparing AR experience'}
          </Text>
          <Text style={styles.infoText}>
            {showEmbeddedWebAr
              ? 'Choose Damaged or Repaired, then tap View in AR inside the viewer to place the generated vehicle model on a detected surface.'
              : unavailable
                ? 'Meshy could not start from the saved scan image. Retry will upload the captured photo directly to the 3D pipeline.'
                : 'The app is uploading your captured vehicle photo to Meshy and waiting for the GLB model before opening AR.'}
          </Text>
          {!ready && !unavailable ? (
            <Text style={styles.loadingHint}>
              {modelMessage || 'Meshy reconstruction is running in the background.'}
            </Text>
          ) : null}
          {webArError ? <Text style={styles.errorHint}>{webArError}</Text> : null}
          {!webArLoaded && showEmbeddedWebAr ? (
            <Text style={styles.loadingHint}>
              AR page is loading in the viewer above.
            </Text>
          ) : null}
        </GlassPanel>

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
        primaryLabel={
          showEmbeddedWebAr
            ? 'Open AR Page in Browser'
            : unavailable
              ? 'Retry 3D Twin'
              : 'Continue to Cost Estimate'
        }
        primaryIcon={showEmbeddedWebAr ? 'open-outline' : unavailable ? 'refresh-outline' : 'cash'}
        onPrimaryPress={() => {
          if (showEmbeddedWebAr) {
            openWebArInBrowser();
          } else if (unavailable) {
            startOrPoll(true);
          } else {
            router.push('/(customer)/scan/estimate' as never);
          }
        }}
        secondaryLabel={unavailable ? 'Retry 3D Twin' : 'Skip to Cost Estimate'}
        onSecondaryPress={
          unavailable
            ? () => startOrPoll(true)
            : () => router.push('/(customer)/scan/estimate' as never)
        }
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
  viewerCard: {
    borderColor: 'rgba(255,107,53,0.30)',
  },
  viewerCardAfter: {
    borderColor: 'rgba(16,185,129,0.36)',
  },
  viewerInner: {
    padding: 0,
    height: 520,
  },
  webview: {
    flex: 1,
    backgroundColor: '#050506',
  },
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
  browserSide: {
    width: 92,
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
  errorHint: {
    color: scannerColors.red,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
  },
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
    fontWeight: '800',
  },
  damageTag: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
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
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
});
