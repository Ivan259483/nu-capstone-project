using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.Management;

namespace VehicleIntelligence
{
    public class UnityRuntimeDiagnostics : MonoBehaviour
    {
        private const float StatusIntervalSeconds = 1f;
        private const int StatusTicks = 10;

        private IEnumerator Start()
        {
            Debug.Log("[VehicleIntelligenceDiagnostics] Start.");
            PostStatus("start_before_permission");

            yield return EnsureCameraPermission();

            PostStatus("start_after_permission");
            for (var i = 0; i < StatusTicks; i++)
            {
                yield return new WaitForSeconds(StatusIntervalSeconds);
                PostStatus($"tick_{i + 1}");
            }
        }

        private static IEnumerator EnsureCameraPermission()
        {
            if (Application.HasUserAuthorization(UserAuthorization.WebCam))
                yield break;

            Debug.Log("[VehicleIntelligenceDiagnostics] Requesting camera authorization.");
            yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);
        }

        private static void PostStatus(string phase)
        {
            var scene = SceneManager.GetActiveScene();
            var camera = Camera.main;
            var arSession = FindFirstObjectByType<ARSession>();
            var arCameraManager = camera != null ? camera.GetComponent<ARCameraManager>() : null;
            var arCameraBackground = camera != null ? camera.GetComponent<ARCameraBackground>() : null;
            var xrManager = XRGeneralSettings.Instance != null ? XRGeneralSettings.Instance.Manager : null;
            var activeLoader = xrManager != null && xrManager.activeLoader != null
                ? xrManager.activeLoader.name
                : "none";

            var json = new StringBuilder(256);
            json.Append("{\"event\":\"unity_status\"");
            Append(json, "phase", phase);
            Append(json, "scene", scene.name);
            Append(json, "camera", camera != null ? camera.name : "missing");
            Append(json, "arSession", arSession != null ? "present" : "missing");
            Append(json, "arState", ARSession.state.ToString());
            Append(json, "notTrackingReason", ARSession.notTrackingReason.ToString());
            Append(json, "arCameraManager", arCameraManager != null ? "present" : "missing");
            Append(json, "arCameraBackground", arCameraBackground != null ? "present" : "missing");
            Append(json, "xrLoader", activeLoader);
            Append(json, "cameraPermission", Application.HasUserAuthorization(UserAuthorization.WebCam) ? "granted" : "missing");
            json.Append('}');

            var payload = json.ToString();
            Debug.Log($"[VehicleIntelligenceDiagnostics] {payload}");
            RnBridge.PostJson(payload);
        }

        private static void Append(StringBuilder json, string key, string value)
        {
            json.Append(",\"");
            json.Append(Escape(key));
            json.Append("\":\"");
            json.Append(Escape(value));
            json.Append('"');
        }

        private static string Escape(string value)
        {
            return string.IsNullOrEmpty(value)
                ? ""
                : value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
