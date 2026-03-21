# AI 3D Reconstruction Pipeline

This directory contains the Python pipeline for generating realistic 3D models from photos using **COLMAP** (Structure-from-Motion & Multi-View Stereo).

## Prerequisites

### 1. Install COLMAP
The pipeline relies on the `colmap` command-line tool.

- **macOS (Homebrew):**
  ```bash
  brew install colmap
  ```
- **Ubuntu/Debian:**
  ```bash
  sudo apt-get install colmap
  ```
- **Windows:**
  Download the pre-built binaries from [COLMAP release page](https://github.com/colmap/colmap/releases) and add the folder to your system `PATH`.

### 2. Python Environment
Create a virtual environment and install dependencies:

```bash
cd reconstruction
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Usage

Place 50-100 photos of the vehicle in a folder (e.g., `input_images/`). Ensure good lighting and overlap between photos.

Run the pipeline:

```bash
python scanner.py --input ./input_images --output ./output_model
```

### Arguments
- `--input` (`-i`): Path to folder containing source images.
- `--output` (`-o`): Path where output models will be saved.
- `--quality` (`-q`): Reconstruction quality (`low`, `medium`, `high`). Default: `medium`.

## Output
The script will generate several files in the output directory. The final mesh will be at:
`./output_model/meshed.ply`

## Post-Processing (Crucial for Web)
The raw output will be high-poly and untextured or vertex-colored.

1. **Clean & Decimate:** Open `meshed.ply` in **MeshLab** or Blender.
2. **Crop:** Remove ground plane and background noise.
3. **Simplify:** Reduce face count to ~50k-100k for mobile performance.
4. **Export:** Save as `.glb`.
5. **Deploy:** Move the `.glb` file to `autospf/public/models/`.

## Troubleshooting
- **"command not found: colmap"**: Ensure COLMAP is installed and in your system PATH.
- **GPU Errors**: COLMAP requires a CUDA-capable GPU for dense reconstruction on Linux/Windows. On macOS, it attempts to use CPU/Metal but dense mapping can be slow.
