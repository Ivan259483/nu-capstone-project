using System;
using System.Collections.Generic;
using UnityEngine;

namespace VehicleIntelligence
{
    /// <summary>
    /// Maps backend part strings to child anchor names under the procedural vehicle root.
    /// Mirrors the intent of mobile ARRepairViewer AREA_COORDINATE_MAP (string → logical part).
    /// </summary>
    public static class PartAnchorResolver
    {
        private static readonly Dictionary<string, string> CanonicalMap = new(StringComparer.OrdinalIgnoreCase)
        {
            { "front bumper", "FrontBumper" },
            { "rear bumper", "RearBumper" },
            { "hood", "Hood" },
            { "grille", "Grille" },
            { "left headlight", "LeftHeadlight" },
            { "right headlight", "RightHeadlight" },
            { "windshield", "Windshield" },
            { "left fender", "LeftFender" },
            { "right fender", "RightFender" },
            { "left door", "LeftDoor" },
            { "right door", "RightDoor" },
            { "roof", "Roof" },
            { "trunk", "Trunk" },
            { "tailgate", "Tailgate" },
        };

        public static Transform Resolve(Transform vehicleRoot, string damagedPart, int indexFallback = 0)
        {
            if (vehicleRoot == null || string.IsNullOrWhiteSpace(damagedPart))
                return vehicleRoot;

            var key = damagedPart.Trim().ToLowerInvariant();
            if (CanonicalMap.TryGetValue(key, out var anchorName))
            {
                var t = vehicleRoot.Find(anchorName);
                if (t != null) return t;
            }

            foreach (var kv in CanonicalMap)
            {
                var words = kv.Key.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                var matched = 0;
                foreach (var w in words)
                    if (key.Contains(w)) matched++;
                if (matched >= 2 || (words.Length == 1 && key.Contains(words[0])))
                {
                    var t = vehicleRoot.Find(kv.Value);
                    if (t != null) return t;
                }
            }

            // Broad fallbacks
            if (key.Contains("headlight") || key.Contains("headlamp"))
                return vehicleRoot.Find(key.Contains("left") ? "LeftHeadlight" : "RightHeadlight")
                       ?? vehicleRoot.Find("RightHeadlight") ?? vehicleRoot.Find("LeftHeadlight");
            if (key.Contains("bumper") && key.Contains("front")) return vehicleRoot.Find("FrontBumper") ?? vehicleRoot;
            if (key.Contains("bumper") && key.Contains("rear")) return vehicleRoot.Find("RearBumper") ?? vehicleRoot;
            if (key.Contains("hood")) return vehicleRoot.Find("Hood") ?? vehicleRoot;

            return vehicleRoot.Find("FrontBumper") ?? vehicleRoot;
        }
    }
}
