using System;
using System.Collections.Generic;
using UnityEngine;

namespace VehicleIntelligence
{
    /// <summary>
    /// Spawns simple visual overlays for scratch / dent / cracked bumper / broken headlight at anchors.
    /// </summary>
    public class DamageOverlaySpawner : MonoBehaviour
    {
        private readonly List<GameObject> _spawned = new();

        public void Clear()
        {
            foreach (var go in _spawned)
                if (go != null) Destroy(go);
            _spawned.Clear();
        }

        public void Apply(Transform vehicleRoot, IReadOnlyList<DamageEntry> entries)
        {
            Clear();
            for (var i = 0; i < entries.Count; i++)
            {
                var e = entries[i];
                var anchor = PartAnchorResolver.Resolve(vehicleRoot, e.Part, i);
                var kind = NormalizeDamage(e.DamageType);
                var sev = SeverityFactor(e.Severity);
                switch (kind)
                {
                    case DamageVisualKind.Scratch:
                        SpawnScratch(anchor, sev);
                        break;
                    case DamageVisualKind.Dent:
                        SpawnDent(anchor, sev);
                        break;
                    case DamageVisualKind.CrackedBumper:
                    case DamageVisualKind.Crack:
                        SpawnCrack(anchor, sev);
                        break;
                    case DamageVisualKind.BrokenHeadlight:
                        SpawnHeadlightDamage(anchor, sev);
                        break;
                    default:
                        SpawnHotspot(anchor, sev);
                        break;
                }
            }
        }

        private static DamageVisualKind NormalizeDamage(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return DamageVisualKind.Unknown;
            var s = raw.ToLowerInvariant();
            if (s.Contains("scratch")) return DamageVisualKind.Scratch;
            if (s.Contains("dent")) return DamageVisualKind.Dent;
            if (s.Contains("crack") && s.Contains("bumper")) return DamageVisualKind.CrackedBumper;
            if (s.Contains("crack")) return DamageVisualKind.Crack;
            if (s.Contains("headlight") || s.Contains("lamp")) return DamageVisualKind.BrokenHeadlight;
            return DamageVisualKind.Unknown;
        }

        private static float SeverityFactor(string sev)
        {
            if (string.IsNullOrEmpty(sev)) return 0.6f;
            return sev.ToLowerInvariant() switch
            {
                "minor" => 0.45f,
                "moderate" => 0.75f,
                "severe" => 1f,
                _ => 0.6f
            };
        }

        private void SpawnScratch(Transform anchor, float sev)
        {
            var line = new GameObject("ScratchVFX");
            line.transform.SetParent(anchor, false);
            line.transform.localPosition = Vector3.zero;
            var lr = line.AddComponent<LineRenderer>();
            lr.positionCount = 8;
            lr.widthMultiplier = 0.006f + sev * 0.01f;
            lr.material = NewUnlit(new Color(1f, 0.15f, 0.1f, 0.95f));
            lr.useWorldSpace = false;
            for (var i = 0; i < 8; i++)
            {
                var t = i / 7f;
                lr.SetPosition(i, new Vector3(Mathf.Lerp(-0.08f, 0.06f, t), Mathf.Sin(t * Mathf.PI) * 0.02f * sev, 0.02f));
            }
            _spawned.Add(line);
        }

        private void SpawnDent(Transform anchor, float sev)
        {
            var dent = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            dent.name = "DentVFX";
            dent.transform.SetParent(anchor, false);
            dent.transform.localPosition = new Vector3(0, -0.02f, 0.02f);
            dent.transform.localScale = Vector3.one * (0.06f + 0.05f * sev);
            var col = dent.GetComponent<Collider>();
            if (col != null) Destroy(col);
            ApplyColor(dent, new Color(0.35f, 0.05f, 0.05f, 0.85f));
            _spawned.Add(dent);
        }

        private void SpawnCrack(Transform anchor, float sev)
        {
            var crack = new GameObject("CrackVFX");
            crack.transform.SetParent(anchor, false);
            var lr = crack.AddComponent<LineRenderer>();
            lr.positionCount = 5;
            lr.widthMultiplier = 0.004f + sev * 0.008f;
            lr.material = NewUnlit(new Color(0.15f, 0.15f, 0.15f, 0.9f));
            lr.useWorldSpace = false;
            lr.SetPosition(0, new Vector3(-0.04f, 0.02f, 0.03f));
            lr.SetPosition(1, new Vector3(-0.01f, 0.06f, 0.02f));
            lr.SetPosition(2, new Vector3(0.02f, 0.03f, 0.04f));
            lr.SetPosition(3, new Vector3(0.05f, 0.08f, 0.02f));
            lr.SetPosition(4, new Vector3(0.08f, 0.04f, 0.03f));
            _spawned.Add(crack);
        }

        private void SpawnHeadlightDamage(Transform anchor, float sev)
        {
            var shard = GameObject.CreatePrimitive(PrimitiveType.Cube);
            shard.name = "HeadlightDamageVFX";
            shard.transform.SetParent(anchor, false);
            shard.transform.localScale = new Vector3(0.12f, 0.06f, 0.04f) * (0.8f + sev * 0.4f);
            Destroy(shard.GetComponent<Collider>());
            ApplyColor(shard, new Color(0.9f, 0.2f, 0.05f, 0.75f));
            _spawned.Add(shard);
        }

        private void SpawnHotspot(Transform anchor, float sev)
        {
            var disc = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            disc.name = "DamageHotspot";
            disc.transform.SetParent(anchor, false);
            disc.transform.localScale = Vector3.one * (0.08f + 0.06f * sev);
            Destroy(disc.GetComponent<Collider>());
            ApplyColor(disc, new Color(1f, 0f, 0f, 0.55f));
            _spawned.Add(disc);
        }

        private static Material NewUnlit(Color c)
        {
            var shader = Shader.Find("Universal Render Pipeline/Unlit")
                         ?? Shader.Find("Unlit/Color")
                         ?? Shader.Find("Sprites/Default");
            var m = new Material(shader);
            if (m.HasProperty("_BaseColor"))
                m.SetColor("_BaseColor", c);
            else
                m.color = c;
            return m;
        }

        private static void ApplyColor(GameObject go, Color c)
        {
            var r = go.GetComponent<Renderer>();
            if (r == null) return;
            r.material = NewUnlit(c);
        }

        private enum DamageVisualKind
        {
            Unknown,
            Scratch,
            Dent,
            Crack,
            CrackedBumper,
            BrokenHeadlight
        }
    }

    [Serializable]
    public struct DamageEntry
    {
        public string DamageType;
        public string Part;
        public string Severity;
    }
}
