#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using Unity.XR.CoreUtils;

namespace VehicleIntelligence.Editor
{
    /// <summary>
    /// One-click scene bootstrap: AR Session, XR Origin, plane + raycast, placement, bridge.
    /// Run from menu after opening this project in Unity 6 + AR Foundation packages resolve.
    /// </summary>
    public static class VehicleIntelligenceSceneSetup
    {
        private const string ScenePath = "Assets/VehicleIntelligenceScene.unity";

        [MenuItem("VehicleIntelligence/Setup AR Scene (Vehicle Intelligence)")]
        public static void Setup()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var sun = new GameObject("Directional Light");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.05f;
            sun.transform.rotation = Quaternion.Euler(55f, -25f, 0f);

            var sessionGo = new GameObject("AR Session");
            sessionGo.AddComponent<ARSession>();

            var originGo = new GameObject("XR Origin");
            var xrOrigin = originGo.AddComponent<XROrigin>();
            var planeManager = originGo.AddComponent<ARPlaneManager>();
            planeManager.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            originGo.AddComponent<ARRaycastManager>();
            originGo.AddComponent<ARVehiclePlacementController>();

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(originGo.transform, false);
            camGo.transform.localPosition = new Vector3(0f, 1.4f, -1.4f);
            camGo.transform.localRotation = Quaternion.identity;
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 100f;
            camGo.AddComponent<AudioListener>();
            camGo.AddComponent<ARCameraManager>();
            camGo.AddComponent<ARCameraBackground>();
            camGo.AddComponent<ARPoseDriver>();

            xrOrigin.Camera = cam;

            var bridgeGo = new GameObject("VehicleIntelligenceBridge");
            bridgeGo.AddComponent<VehicleIntelligenceBridge>();
            bridgeGo.AddComponent<UnityRuntimeDiagnostics>();

            EditorSceneManager.SaveScene(scene, ScenePath);

            var list = new List<EditorBuildSettingsScene>();
            foreach (var s in EditorBuildSettings.scenes)
            {
                if (s.path != ScenePath)
                    list.Add(s);
            }

            list.Add(new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = list.ToArray();

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"[VehicleIntelligence] Scene saved to {ScenePath}. Enable ARKit (iOS) / ARCore (Android) in XR Plug-in Management, then build.");
        }
    }
}
#endif
