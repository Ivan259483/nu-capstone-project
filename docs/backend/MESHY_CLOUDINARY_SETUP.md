# Meshy + Cloudinary Setup (Deterministic 3D)

This backend now uploads scan images to Cloudinary first, then sends those hosted URLs to Meshy.

## Why this is required

- Direct multipart/data-URI payloads can fail unpredictably across environments.
- Public hosted URLs make Meshy image-to-3D generation deterministic and production-safe.

## Required environment variables

```env
MESHY_API_KEY=...
MESHY_API_BASE_URL=https://api.meshy.ai/openapi/v2

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_UPLOAD_FOLDER=vehicle-scans
```

Alternative unsigned Cloudinary mode:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_UPLOAD_PRESET=...
CLOUDINARY_UPLOAD_FOLDER=vehicle-scans
```

## Runtime behavior

1. `POST /api/ai/generate-3d`
   - Validates uploaded images.
   - Uploads each image to Cloudinary.
   - Sends Cloudinary URLs to Meshy (`image_url` + `image_urls`).
   - Returns either:
     - `status=ar_ready` with `model_url`, or
     - `status=processing` with `task_id` for polling.

2. `GET /api/ai/generate-3d/:taskId`
   - Polls Meshy until `ar_ready` or `failed`.

If Cloudinary or Meshy is not configured, backend responds:
- `success: true`
- `status: "unavailable"`
- `reason` with a configuration hint.
