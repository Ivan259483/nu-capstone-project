#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.XR.ARKit;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;

namespace VehicleIntelligence.Editor
{
    public static class VehicleIntelligenceIosBuild
    {
        public static void Export()
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.iOS, BuildTarget.iOS);
            ConfigureIosArSettings();
            VehicleIntelligenceSceneSetup.Setup();

            var output = Environment.GetEnvironmentVariable("AUTOSPF_UNITY_IOS_EXPORT");
            if (string.IsNullOrWhiteSpace(output))
            {
                output = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../mobile/unity/builds/ios"));
            }

            if (Directory.Exists(output))
                Directory.Delete(output, true);

            Directory.CreateDirectory(output);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { "Assets/VehicleIntelligenceScene.unity" },
                locationPathName = output,
                target = BuildTarget.iOS,
                options = BuildOptions.None
            };

            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new Exception($"Unity iOS export failed: {report.summary.result}");
            }

            Debug.Log($"[VehicleIntelligence] iOS export written to {output}");
        }

        private static void ConfigureIosArSettings()
        {
            PlayerSettings.iOS.cameraUsageDescription = "Camera is used for vehicle scanning and AR damage inspection.";
            EditorUtility.SetDirty(Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings"));

            var arkitSettings = ARKitSettings.currentSettings ?? AssetDatabase.LoadAssetAtPath<ARKitSettings>("Assets/XR/Settings/ARKitSettings.asset");
            if (arkitSettings == null)
            {
                Directory.CreateDirectory("Assets/XR/Settings");
                arkitSettings = ScriptableObject.CreateInstance<ARKitSettings>();
                AssetDatabase.CreateAsset(arkitSettings, "Assets/XR/Settings/ARKitSettings.asset");
            }
            arkitSettings.requirement = ARKitSettings.Requirement.Required;
            arkitSettings.faceTracking = false;
            ARKitSettings.currentSettings = arkitSettings;
            EditorUtility.SetDirty(arkitSettings);

            var perBuildTarget = GetOrCreateXrSettingsPerBuildTarget();
            if (!perBuildTarget.HasSettingsForBuildTarget(BuildTargetGroup.iOS))
                perBuildTarget.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.iOS);

            if (!perBuildTarget.HasManagerSettingsForBuildTarget(BuildTargetGroup.iOS))
                perBuildTarget.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.iOS);

            var generalSettings = perBuildTarget.SettingsForBuildTarget(BuildTargetGroup.iOS);
            generalSettings.InitManagerOnStart = true;
            EditorUtility.SetDirty(generalSettings);

            var managerSettings = perBuildTarget.ManagerSettingsForBuildTarget(BuildTargetGroup.iOS);
            managerSettings.automaticLoading = true;
            managerSettings.automaticRunning = true;

            const string arkitLoaderType = "UnityEngine.XR.ARKit.ARKitLoader";
            if (!XRPackageMetadataStore.IsLoaderAssigned(arkitLoaderType, BuildTargetGroup.iOS) &&
                !XRPackageMetadataStore.AssignLoader(managerSettings, arkitLoaderType, BuildTargetGroup.iOS))
            {
                throw new Exception("Failed to assign Apple ARKit loader for iOS XR Plug-in Management.");
            }

            EditorUtility.SetDirty(managerSettings);
            EditorUtility.SetDirty(perBuildTarget);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[VehicleIntelligence] iOS AR settings verified: Requires ARKit, ARKit loader, Initialize XR on Startup.");
        }

        private static XRGeneralSettingsPerBuildTarget GetOrCreateXrSettingsPerBuildTarget()
        {
            var guids = AssetDatabase.FindAssets("t:XRGeneralSettingsPerBuildTarget");
            if (guids.Length > 0)
            {
                var path = AssetDatabase.GUIDToAssetPath(guids[0]);
                var existing = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>(path);
                if (existing != null)
                {
                    EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, existing, true);
                    return existing;
                }
            }

            Directory.CreateDirectory("Assets/XR");
            var created = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
            AssetDatabase.CreateAsset(created, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
            EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, created, true);
            AssetDatabase.SaveAssets();
            return created;
        }
    }
}
#endif
