using UnityEngine;

namespace VehicleIntelligence
{
    /// <summary>
    /// Procedural placeholder bodies (sedan / SUV / pickup) with named anchor transforms for damage VFX.
    /// Replace with authored FBX/GLB prefabs when art is ready — keep anchor names stable.
    /// </summary>
    public static class VehiclePrimitiveFactory
    {
        public static GameObject Create(VehicleKind kind, Transform parent)
        {
            var root = new GameObject($"Vehicle_{kind}");
            root.transform.SetParent(parent, false);
            root.layer = LayerMask.NameToLayer("Default");

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "Body";
            body.transform.SetParent(root.transform, false);
            body.transform.localPosition = new Vector3(0, 0.25f, 0);

            switch (kind)
            {
                case VehicleKind.Sedan:
                    body.transform.localScale = new Vector3(0.9f, 0.35f, 2.0f);
                    break;
                case VehicleKind.Suv:
                    body.transform.localScale = new Vector3(1.05f, 0.55f, 1.85f);
                    break;
                case VehicleKind.Pickup:
                    body.transform.localScale = new Vector3(0.95f, 0.4f, 2.15f);
                    // simple cab offset visual
                    var bed = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    bed.name = "Bed";
                    bed.transform.SetParent(root.transform, false);
                    bed.transform.localPosition = new Vector3(0, 0.22f, -0.75f);
                    bed.transform.localScale = new Vector3(0.85f, 0.12f, 0.9f);
                    break;
            }

            AddAnchor(root.transform, "FrontBumper", new Vector3(0, 0.12f, 0.52f));
            AddAnchor(root.transform, "RearBumper", new Vector3(0, 0.12f, -0.52f));
            AddAnchor(root.transform, "Hood", new Vector3(0, 0.28f, 0.35f));
            AddAnchor(root.transform, "Grille", new Vector3(0, 0.1f, 0.52f));
            AddAnchor(root.transform, "LeftHeadlight", new Vector3(-0.32f, 0.14f, 0.48f));
            AddAnchor(root.transform, "RightHeadlight", new Vector3(0.32f, 0.14f, 0.48f));
            AddAnchor(root.transform, "Windshield", new Vector3(0, 0.32f, 0.15f));
            AddAnchor(root.transform, "LeftFender", new Vector3(-0.42f, 0.15f, 0.25f));
            AddAnchor(root.transform, "RightFender", new Vector3(0.42f, 0.15f, 0.25f));
            AddAnchor(root.transform, "LeftDoor", new Vector3(-0.46f, 0.18f, 0f));
            AddAnchor(root.transform, "RightDoor", new Vector3(0.46f, 0.18f, 0f));
            AddAnchor(root.transform, "Roof", new Vector3(0, 0.42f, 0f));
            AddAnchor(root.transform, "Trunk", new Vector3(0, 0.28f, -0.38f));
            AddAnchor(root.transform, "Tailgate", new Vector3(0, 0.22f, -0.52f));

            return root;
        }

        private static void AddAnchor(Transform parent, string name, Vector3 localPos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
        }
    }
}
