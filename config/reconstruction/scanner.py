import argparse
import subprocess
import os
import sys
from pathlib import Path

def run_command(cmd, cwd=None):
    """Run a shell command and stream output."""
    print(f"Running: {' '.join(cmd)}")
    try:
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                print(output.strip())
        rc = process.poll()
        if rc != 0:
            print(f"Error executing command. Exit code: {rc}")
            sys.exit(rc)
    except FileNotFoundError:
        print(f"Command not found: {cmd[0]}")
        sys.exit(1)

def check_colmap_installation():
    """Verify COLMAP is installed and accessible."""
    try:
        subprocess.run(["colmap", "help"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ COLMAP found.")
    except FileNotFoundError:
        print("❌ COLMAP not found. Please install COLMAP regular CLI.")
        print("   macOS: brew install colmap")
        print("   Ubuntu: sudo apt-get install colmap")
        print("   Windows: https://colmap.github.io/install.html")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="AI 3D Reconstruction Pipeline (COLMAP Wrapper)")
    parser.add_argument("--input", "-i", required=True, help="Path to folder containing source images")
    parser.add_argument("--output", "-o", required=True, help="Path to output folder for 3D model")
    parser.add_argument("--quality", "-q", choices=["low", "medium", "high", "extreme"], default="medium", help="Reconstruction quality")
    
    args = parser.parse_args()
    
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    db_path = output_path / "database.db"
    sparse_path = output_path / "sparse"
    dense_path = output_path / "dense"

    if not input_path.exists():
        print(f"❌ Input folder not found: {input_path}")
        sys.exit(1)

    # Clean start
    output_path.mkdir(parents=True, exist_ok=True)
    sparse_path.mkdir(parents=True, exist_ok=True)
    dense_path.mkdir(parents=True, exist_ok=True)

    print("🚀 Starting 3D Reconstruction Pipeline...")
    check_colmap_installation()

    # Step 1: Feature Extraction
    print("\n📸 Step 1: Feature Extraction...")
    run_command([
        "colmap", "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(input_path),
        "--ImageReader.camera_model", "PINHOLE",
        "--SiftExtraction.use_gpu", "1"
    ])

    # Step 2: Feature Matching
    print("\n🔍 Step 2: Feature Matching...")
    run_command([
        "colmap", "exhaustive_matcher",
        "--database_path", str(db_path),
        "--SiftMatching.use_gpu", "1"
    ])

    # Step 3: Sparse Reconstruction (Structure-from-Motion)
    print("\n🌐 Step 3: Sparse Reconstruction...")
    run_command([
        "colmap", "mapper",
        "--database_path", str(db_path),
        "--image_path", str(input_path),
        "--output_path", str(sparse_path)
    ])

    # Step 4: Image Undistortion (Prep for Dense Reconstruction)
    print("\n📐 Step 4: Image Undistortion...")
    run_command([
        "colmap", "image_undistorter",
        "--image_path", str(input_path),
        "--input_path", str(sparse_path) + "/0",
        "--output_path", str(dense_path),
        "--output_type", "COLMAP",
        "--max_image_size", "2000"
    ])

    # Step 5: Dense Reconstruction (Multi-View Stereo)
    print("\n🧠 Step 5: Dense Reconstruction (Stereo)...")
    run_command([
        "colmap", "patch_match_stereo",
        "--workspace_path", str(dense_path),
        "--workspace_format", "COLMAP",
        "--PatchMatchStereo.geom_consistency", "true"
    ])

    # Step 6: Dense Fusion (Point Cloud Generation)
    print("\n☁️ Step 6: Dense Fusion...")
    run_command([
        "colmap", "stereo_fusion",
        "--workspace_path", str(dense_path),
        "--workspace_format", "COLMAP",
        "--input_type", "geometric",
        "--output_path", str(dense_path / "fused.ply")
    ])

    # Step 7: Meshing (Poisson Reconstruction)
    print("\n🕸️ Step 7: Meshing (Poisson)...")
    run_command([
        "colmap", "poisson_mesher",
        "--input_path", str(dense_path / "fused.ply"),
        "--output_path", str(output_path / "meshed.ply")
    ])

    print(f"\n✅ Reconstruction Complete!")
    print(f"📂 Output Model: {output_path / 'meshed.ply'}")
    print("\nNext Steps:")
    print("1. Open 'meshed.ply' in MeshLab to clean noise.")
    print("2. Simplify mesh to <50k faces for web/mobile.")
    print("3. Export as GLB and drop into 'autospf/public/models/'.")

if __name__ == "__main__":
    main()
