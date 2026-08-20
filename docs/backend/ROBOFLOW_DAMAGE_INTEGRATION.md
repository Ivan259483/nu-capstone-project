# Roboflow YOLO11 Damage Detection Integration

AutoGloss uses its existing Expo/React Native mobile app, React/Vite web client, and Express/MongoDB backend. The DETECT stage now calls `POST /api/ai/scan`; neither client communicates with Roboflow directly.

## Request flow

1. The Expo scan flow captures the required vehicle views and sends them to the existing backend proxy. The web/Capacitor client additionally compresses selected images to a maximum 1600 px edge and approximately 900 KB.
2. Express accepts `multipart/form-data` in the `images` field (1–5 images, 10 MB maximum each), verifies that Sharp can decode the image, rotates it from EXIF orientation, and JPEG-compresses it again as a server-side safety boundary.
3. The backend sends base64 image data to the Roboflow Workflow endpoint with the server-only API key.
4. The Workflow output parser extracts class, confidence, bounding box, polygon mask, and pixel/percentage area.
5. The result is converted to an AutoGloss Damage Report, passed to the existing estimator, and persisted in `AIScan` for the 3D and AR endpoints.

The response also includes `integration.recommendation`, `integration.costEstimation`, `integration.visualization3d`, and `integration.ar`. These are stable handoff objects for future ChatGPT, Meshy, Google AR Viewer, and analytics adapters.

## Required backend environment

```dotenv
ROBOFLOW_API_KEY=replace_with_private_server_key
ROBOFLOW_WORKSPACE=ivan-tadena
ROBOFLOW_WORKFLOW_ID=vehicle-damage-dataset-vvehicle-damage-dataset-le164-1-yolo11s-seg-t1-logic
ROBOFLOW_IMAGE_INPUT=image
```

Optional settings:

```dotenv
ROBOFLOW_API_URL=https://serverless.roboflow.com
ROBOFLOW_TIMEOUT_MS=20000
ROBOFLOW_MAX_RETRIES=1
ROBOFLOW_MIN_CONFIDENCE=0.20
ROBOFLOW_MAX_IMAGE_EDGE=1600
```

Do not add any Roboflow variable to `frontend/.env`, and do not prefix it with `VITE_`, `NEXT_PUBLIC_`, or `EXPO_PUBLIC_`.

Existing optional dependencies remain unchanged:

- MongoDB persists reports and provides a `scanId` to the 3D/AR stages.
- Cloudinary archives the uploaded scan image for Meshy.
- Meshy consumes the stored `scanId` through the existing `/api/ai/generate-3d-from-scan` flow.

## API request

```bash
curl -X POST http://localhost:3000/api/ai/scan \
  -H "Authorization: Bearer <optional-autogloss-jwt>" \
  -F "images=@/absolute/path/to/vehicle.jpg" \
  -F 'angles=["rear"]' \
  -F 'damageAreas=["Rear Bumper"]'
```

The endpoint returns HTTP 200 for both damage and valid zero-prediction results. Check `data.noDamageDetected` and `data.damageReport.status`. Invalid images return 400/415, upstream failures return 502/503, and timeouts return 504 with a stable `code` field.

## Testing procedure

1. Copy the Roboflow variables into `backend/.env` and start MongoDB.
2. Run `npm run dev --prefix backend` and `npm start --prefix mobile` (or `npm run dev --prefix frontend` for the web flow).
3. Open the native customer scan route or `/ar-estimator` in the browser.
4. Test a clear JPG/PNG/WebP vehicle image. Confirm the report shows class, confidence, affected area, severity, detected area, segmentation overlay, and estimate.
5. Test a clean vehicle image. Confirm the scan completes with `no_damage_detected` rather than showing mock issues.
6. Test a text file renamed to `.jpg`; expect `INVALID_IMAGE` without a Roboflow request.
7. Test a file larger than 10 MB; expect a client or server size error.
8. Temporarily set `ROBOFLOW_TIMEOUT_MS=3000` and use a slow connection; confirm a retryable timeout message and HTTP 504.
9. Temporarily use an invalid key; confirm `ROBOFLOW_AUTH_FAILED` and that neither the response nor browser bundle contains the key.
10. For a persisted scan, call `GET /api/ai/scan/:scanId` and `/api/ai/webar-session/:scanId`; confirm normalized mask and area data are available to downstream modules.

Automated parser/model tests run with:

```bash
node --test backend/tests/roboflowDamage.service.test.js
npm run typecheck --prefix mobile
npm run build --prefix frontend
```

Roboflow documents Workflow image inputs as `{ "type": "base64", "value": "..." }` and the hosted endpoint as `/infer/workflows/<workspace>/<workflow-id>`: [Roboflow Workflows HTTP integration](https://inference.roboflow.com/workflows/modes_of_running/).
