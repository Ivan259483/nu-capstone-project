using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.Management;

namespace VehicleIntelligence
{
    /// <summary>
    /// Host object for Vehicle Intelligence AI Inspection — receives JSON from React Native via
    /// UnitySendMessage("VehicleIntelligenceBridge", "LoadDamageData", json).
    /// </summary>
    public class VehicleIntelligenceBridge : MonoBehaviour
    {
        public static VehicleIntelligenceBridge Instance { get; private set; }

        public VehicleKind PendingVehicleKind { get; private set; } = VehicleKind.Sedan;

        private readonly List<DamageEntry> _cached = new();
        private DamageOverlaySpawner _spawner;
        private Transform _vehicleRoot;
        private bool _afterRepairMode;
        private bool _spinVehicle;
        private GameObject _uiRoot;
        private Renderer[] _bodyRenderers;
        private Coroutine _readyLoop;

        private void Awake()
        {
            Debug.Log("[VehicleIntelligenceBridge] Awake called!");
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            var host = new GameObject("DamageOverlayHost");
            host.transform.SetParent(transform, false);
            _spawner = host.AddComponent<DamageOverlaySpawner>();

            BuildHud();
        }

        private void OnEnable()
        {
            Debug.Log("[VehicleIntelligenceBridge] OnEnable.");
            StartReadyLoop();
        }

        private void OnDestroy()
        {
            if (_readyLoop != null)
            {
                StopCoroutine(_readyLoop);
                _readyLoop = null;
            }
            if (Instance == this) Instance = null;
        }

        private void Start()
        {
            Debug.Log("[VehicleIntelligenceBridge] Start.");
            StartReadyLoop();
        }

        private void StartReadyLoop()
        {
            if (_readyLoop != null) return;
            _readyLoop = StartCoroutine(PostUnityReadyLoop());
        }

        private IEnumerator PostUnityReadyLoop()
        {
            yield return WaitForUnityArInitialization();

            // Fabric can attach the RN event emitter after Unity's first scene frames.
            // Keep announcing readiness briefly so native->JS startup messages are not lost.
            for (var i = 0; i < 20; i++)
            {
                PostUnityReadyToRn(i == 0 ? "first_frame" : $"retry_{i}");
                yield return new WaitForSeconds(0.5f);
            }
            _readyLoop = null;
        }

        private IEnumerator WaitForUnityArInitialization()
        {
            const float timeoutSeconds = 8f;
            const float pollSeconds = 0.25f;
            var elapsed = 0f;
            var requestedCameraPermission = false;
            var lastReason = "";

            while (elapsed < timeoutSeconds)
            {
                if (IsUnityArInitialized(out var reason))
                {
                    Debug.Log($"[VehicleIntelligenceBridge] Unity AR initialized before unity_ready ({reason}).");
                    yield return null;
                    yield break;
                }

                if (reason != lastReason)
                {
                    Debug.Log($"[VehicleIntelligenceBridge] Waiting before unity_ready: {reason}");
                    lastReason = reason;
                }

                if (!Application.HasUserAuthorization(UserAuthorization.WebCam) && !requestedCameraPermission)
                {
                    requestedCameraPermission = true;
                    Debug.Log("[VehicleIntelligenceBridge] Requesting camera authorization before unity_ready.");
                    yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);
                }
                else
                {
                    yield return new WaitForSeconds(pollSeconds);
                    elapsed += pollSeconds;
                }
            }

            Debug.LogWarning($"[VehicleIntelligenceBridge] Timed out waiting before unity_ready: {lastReason}");
        }

        private static bool IsUnityArInitialized(out string reason)
        {
            var camera = Camera.main;
            if (camera == null)
            {
                reason = "camera_missing";
                return false;
            }

            if (FindFirstObjectByType<ARSession>() == null)
            {
                reason = "ar_session_missing";
                return false;
            }

            if (camera.GetComponent<ARCameraManager>() == null)
            {
                reason = "ar_camera_manager_missing";
                return false;
            }

            if (camera.GetComponent<ARCameraBackground>() == null)
            {
                reason = "ar_camera_background_missing";
                return false;
            }

            if (!Application.HasUserAuthorization(UserAuthorization.WebCam))
            {
                reason = "camera_permission_missing";
                return false;
            }

            var xrManager = XRGeneralSettings.Instance != null ? XRGeneralSettings.Instance.Manager : null;
            if (xrManager == null)
            {
                reason = "xr_manager_missing";
                return false;
            }

            if (!xrManager.isInitializationComplete)
            {
                reason = "xr_initializing";
                return false;
            }

            if (xrManager.activeLoader == null)
            {
                reason = "xr_loader_missing";
                return false;
            }

            reason = $"xr_loader={xrManager.activeLoader.name}, ar_state={ARSession.state}";
            return true;
        }

        private void PostUnityReadyToRn(string phase)
        {
            Debug.Log($"[VehicleIntelligenceBridge] Posting unity_ready ({phase}).");
            RnBridge.PostJson($"{{\"event\":\"unity_ready\",\"phase\":\"{phase}\"}}");
        }

        private void Update()
        {
            if (!_spinVehicle || _vehicleRoot == null) return;
            _vehicleRoot.Rotate(0, 35f * Time.deltaTime, 0, Space.Self);
        }

        /// <summary>API entry from Flask → RN → UnitySendMessage.</summary>
        public void LoadDamageData(string jsonData)
        {
            PostUnityReadyToRn("load_damage_data");
            if (string.IsNullOrWhiteSpace(jsonData)) return;
            try
            {
                var root = JToken.Parse(jsonData);
                _cached.Clear();
                ParsePayload(root);
                TryApplyDamageToVehicle();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[VehicleIntelligenceBridge] LoadDamageData: {e.Message}");
            }
        }

        private void ParsePayload(JToken root)
        {
            if (root is JArray arr)
            {
                foreach (var item in arr)
                    PushDamage(item as JObject);
                return;
            }

            var o = root as JObject;
            if (o == null) return;

            var vt = o["vehicle_type"]?.Value<string>();
            if (!string.IsNullOrEmpty(vt))
                PendingVehicleKind = ParseVehicleKind(vt);

            var damages = o["damages"] as JArray;
            if (damages != null)
            {
                foreach (var item in damages)
                    PushDamage(item as JObject);
                return;
            }

            // Single-object payload (Flask example) or flat issue
            if (o["damage_type"] != null || o["type"] != null || o["damaged_part"] != null || o["affectedArea"] != null)
            {
                if (string.IsNullOrEmpty(vt) && o["vehicle_type"] != null)
                    PendingVehicleKind = ParseVehicleKind(o["vehicle_type"]?.Value<string>());
                PushDamage(o);
            }
        }

        private void PushDamage(JObject item)
        {
            if (item == null) return;
            _cached.Add(new DamageEntry
            {
                DamageType = item["damage_type"]?.Value<string>() ?? item["type"]?.Value<string>() ?? "",
                Part = item["damaged_part"]?.Value<string>() ?? item["affectedArea"]?.Value<string>() ?? "",
                Severity = item["severity"]?.Value<string>() ?? "moderate"
            });
        }

        private static VehicleKind ParseVehicleKind(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return VehicleKind.Sedan;
            var s = raw.Trim().ToLowerInvariant();
            if (s.Contains("suv")) return VehicleKind.Suv;
            if (s.Contains("pick")) return VehicleKind.Pickup;
            return VehicleKind.Sedan;
        }

        public void OnVehiclePlaced(Transform vehicleRoot)
        {
            _vehicleRoot = vehicleRoot;
            CacheBodyRenderers();
            TryApplyDamageToVehicle();
        }

        private void CacheBodyRenderers()
        {
            _bodyRenderers = _vehicleRoot != null
                ? _vehicleRoot.GetComponentsInChildren<Renderer>(true)
                : Array.Empty<Renderer>();
        }

        private void TryApplyDamageToVehicle()
        {
            if (_vehicleRoot == null) return;
            _afterRepairMode = false;
            _spawner.Apply(_vehicleRoot, _cached);
            ApplyBodyDamageTint(true);
        }

        private void ApplyBodyDamageTint(bool damaged)
        {
            if (_bodyRenderers == null) return;
            foreach (var r in _bodyRenderers)
            {
                if (r == null || r.gameObject.name.Contains("VFX")) continue;
                foreach (var m in r.materials)
                {
                    if (!m.HasProperty("_Color")) continue;
                    var baseC = damaged ? new Color(0.85f, 0.82f, 0.8f) : Color.white;
                    m.color = baseC;
                }
            }
        }

        public void ViewDamage() => SetAfterRepairMode(false);

        public void ViewArRepair() => SetAfterRepairMode(true);

        public void RotateVehicle()
        {
            _spinVehicle = !_spinVehicle;
        }

        public void ConfirmRepair()
        {
            RnBridge.PostJson("{\"event\":\"repair_confirmed\"}");
        }

        private void SetAfterRepairMode(bool after)
        {
            _afterRepairMode = after;
            if (_vehicleRoot == null) return;
            if (after)
            {
                _spawner.Clear();
                ApplyBodyDamageTint(false);
            }
            else
            {
                _spawner.Apply(_vehicleRoot, _cached);
                ApplyBodyDamageTint(true);
            }
        }

        private void BuildHud()
        {
            _uiRoot = new GameObject("VehicleIntelligenceHUD");
            _uiRoot.transform.SetParent(transform, false);

            var canvas = _uiRoot.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            _uiRoot.AddComponent<GraphicRaycaster>();

            if (FindFirstObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            var panel = new GameObject("Panel");
            panel.transform.SetParent(_uiRoot.transform, false);
            var rt = panel.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 0);
            rt.anchorMax = new Vector2(1, 0);
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(0, 120);
            rt.anchoredPosition = new Vector2(0, 8);
            var bg = panel.AddComponent<Image>();
            bg.color = new Color(0, 0, 0, 0.55f);

            var layout = panel.AddComponent<HorizontalLayoutGroup>();
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.spacing = 8;
            layout.padding = new RectOffset(12, 12, 8, 8);

            AddButton(panel.transform, "View Damage", ViewDamage);
            AddButton(panel.transform, "View AR Repair", ViewArRepair);
            AddButton(panel.transform, "Rotate Vehicle", RotateVehicle);
            AddButton(panel.transform, "Confirm Repair", ConfirmRepair);
        }

        private static void AddButton(Transform parent, string label, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject(label);
            go.transform.SetParent(parent, false);
            var img = go.AddComponent<Image>();
            img.color = new Color(1f, 0.42f, 0.2f, 0.92f);
            var btn = go.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            var le = go.AddComponent<LayoutElement>();
            le.minHeight = 44;
            le.flexibleWidth = 1;

            var textGo = new GameObject("Text");
            textGo.transform.SetParent(go.transform, false);
            var txt = textGo.AddComponent<Text>();
            txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf")
                     ?? Resources.GetBuiltinResource<Font>("Arial.ttf");
            txt.text = label;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = Color.white;
            txt.fontSize = 12;
            txt.resizeTextForBestFit = true;
            txt.resizeTextMinSize = 8;
            txt.resizeTextMaxSize = 14;
            var tr = textGo.GetComponent<RectTransform>();
            tr.anchorMin = Vector2.zero;
            tr.anchorMax = Vector2.one;
            tr.offsetMin = Vector2.zero;
            tr.offsetMax = Vector2.zero;
        }
    }
}
