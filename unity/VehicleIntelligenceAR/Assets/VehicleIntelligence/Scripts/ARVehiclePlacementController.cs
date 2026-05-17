using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace VehicleIntelligence
{
    /// <summary>
    /// Tap on detected horizontal planes to place the vehicle root (with manipulation + damage host).
    /// </summary>
    [RequireComponent(typeof(ARRaycastManager))]
    public class ARVehiclePlacementController : MonoBehaviour
    {
        private ARRaycastManager _raycast;
        private readonly List<ARRaycastHit> _hits = new();
        public Transform PlacedAnchor { get; private set; }
        public GameObject VehicleInstance { get; private set; }

        private void Awake()
        {
            _raycast = GetComponent<ARRaycastManager>();
        }

        private void Update()
        {
            if (Input.touchCount == 0) return;
            var t = Input.GetTouch(0);
            if (t.phase != TouchPhase.Began) return;
            if (VehicleInstance != null) return; // single placement per session

            if (_raycast.Raycast(t.position, _hits, TrackableType.PlaneWithinPolygon))
            {
                var hit = _hits[0];
                var anchor = new GameObject("PlacedVehicleAnchor").transform;
                anchor.SetPositionAndRotation(hit.pose.position, hit.pose.rotation);
                PlacedAnchor = anchor;

                var kind = VehicleIntelligenceBridge.Instance != null
                    ? VehicleIntelligenceBridge.Instance.PendingVehicleKind
                    : VehicleKind.Sedan;

                VehicleInstance = VehiclePrimitiveFactory.Create(kind, anchor);
                VehicleInstance.AddComponent<VehicleTouchManipulator>().Init(_raycast, anchor);
                VehicleIntelligenceBridge.Instance?.OnVehiclePlaced(VehicleInstance.transform);
            }
        }

        public void ResetPlacement()
        {
            if (VehicleInstance != null) Destroy(VehicleInstance);
            VehicleInstance = null;
            if (PlacedAnchor != null) Destroy(PlacedAnchor.gameObject);
            PlacedAnchor = null;
        }
    }
}
