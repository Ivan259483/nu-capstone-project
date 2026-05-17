using System.Runtime.InteropServices;
using UnityEngine;

namespace VehicleIntelligence
{
    /// <summary>
    /// Sends JSON strings to the host React Native app via @azesmway/react-native-unity.
    /// </summary>
    public static class RnBridge
    {
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        public static void PostJson(string json)
        {
#if UNITY_EDITOR
            Debug.Log($"[RnBridge] {json}");
#elif UNITY_ANDROID
            try
            {
                Debug.Log($"[RnBridge] Android sendMessageToMobileApp: {json}");
                using var jc = new AndroidJavaClass("com.azesmwayreactnativeunity.ReactNativeUnityViewManager");
                jc.CallStatic("sendMessageToMobileApp", json);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[RnBridge] Android post failed: {e.Message}");
            }
#elif UNITY_IOS
            try
            {
                Debug.Log($"[RnBridge] iOS sendMessageToMobileApp: {json}");
                sendMessageToMobileApp(json);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[RnBridge] iOS post failed: {e.Message}");
            }
#endif
        }
    }
}
