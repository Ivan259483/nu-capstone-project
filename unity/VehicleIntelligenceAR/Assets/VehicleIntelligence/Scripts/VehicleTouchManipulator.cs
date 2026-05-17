using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace VehicleIntelligence
{
    /// <summary>
    /// One-finger drag moves anchor on planes; two-finger pinch scales; two-finger twist rotates Y.
    /// </summary>
    public class VehicleTouchManipulator : MonoBehaviour
    {
        private ARRaycastManager _raycast;
        private Transform _anchor;
        private float _initialPinchDist;
        private float _initialScale = 1f;
        private float _initialTwist;

        private readonly List<ARRaycastHit> _hits = new();

        public void Init(ARRaycastManager raycast, Transform anchor)
        {
            _raycast = raycast;
            _anchor = anchor;
        }

        private void Update()
        {
            if (_raycast == null || _anchor == null) return;

            if (Input.touchCount == 1)
            {
                var t = Input.GetTouch(0);
                if (t.phase == TouchPhase.Moved &&
                    _raycast.Raycast(t.position, _hits, TrackableType.PlaneWithinPolygon))
                {
                    var p = _hits[0].pose.position;
                    _anchor.position = new Vector3(p.x, _anchor.position.y, p.z);
                }
            }
            else if (Input.touchCount == 2)
            {
                var a = Input.GetTouch(0);
                var b = Input.GetTouch(1);
                if (a.phase == TouchPhase.Began || b.phase == TouchPhase.Began)
                {
                    _initialPinchDist = Vector2.Distance(a.position, b.position);
                    _initialScale = _anchor.localScale.x;
                    _initialTwist = Mathf.Atan2(b.position.y - a.position.y, b.position.x - a.position.x) * Mathf.Rad2Deg;
                }
                else if (a.phase == TouchPhase.Moved || b.phase == TouchPhase.Moved)
                {
                    var dist = Vector2.Distance(a.position, b.position);
                    if (_initialPinchDist > 10f)
                    {
                        var factor = dist / _initialPinchDist;
                        var s = Mathf.Clamp(_initialScale * factor, 0.35f, 2.5f);
                        _anchor.localScale = new Vector3(s, s, s);
                    }

                    var twist = Mathf.Atan2(b.position.y - a.position.y, b.position.x - a.position.x) * Mathf.Rad2Deg;
                    var delta = twist - _initialTwist;
                    if (delta > 180f) delta -= 360f;
                    if (delta < -180f) delta += 360f;
                    _anchor.Rotate(0, -delta * 0.35f, 0, Space.World);
                    _initialTwist = twist;
                }
            }
        }
    }
}
