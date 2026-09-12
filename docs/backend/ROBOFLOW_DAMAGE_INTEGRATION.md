# Roboflow RF-DETR Damage Localization and Subtype Enrichment

AutoGloss uses its existing Expo/React Native mobile app, React/Vite web client, and Express/MongoDB backend. The DETECT stage now calls `POST /api/ai/scan`; neither client communicates with Roboflow directly.

## Request flow

1. The Expo scan flow captures the required vehicle views and sends them to the existing backend proxy. The web/Capacitor client additionally compresses selected images to a maximum 1600 px edge and approximately 900 KB.
2. Express accepts `multipart/form-data` in the `images` field (1–5 images, 10 MB maximum each), verifies that Sharp can decode the image, rotates it from EXIF orientation, and JPEG-compresses it again as a server-side safety boundary.
3. The backend sends base64 image data to the production Roboflow RF-DETR Workflow endpoint with the server-only API key. RF-DETR detects and localizes generic vehicle damage and supplies the polygon plus localization confidence; it does not predict the customer-facing subtype or vehicle component.
4. The backend preserves the RF-DETR polygon, calculates segmentation-mask area divided by image area, and rejects malformed, tiny, or border-clipped regions from subtype enrichment.
5. For each credible region, the backend crops that region and optionally calls the direct `damage-classifier-o1i5b/3` endpoint with `confidence=0` so Roboflow returns its complete standard `predictions` score list. The backend normalizes and sorts those scores, then accepts only an approved mapping when top-1 confidence is at least `0.60` and the top-1/top-2 margin is at least `0.15`.
6. The result is converted to an AutoGloss Damage Report, passed to the existing estimator, and persisted in `AIScan` for the 3D and AR endpoints. AutoGloss/backend owns abstention and fusion, affected-image-area calculation, and the separate severity, recommendation, and cost logic.

The response also includes `integration.recommendation`, `integration.costEstimation`, `integration.visualization3d`, and `integration.ar`. These are stable handoff objects for future ChatGPT, Meshy, Google AR Viewer, and analytics adapters.

## Required backend environment

```dotenv
ROBOFLOW_API_KEY=replace_with_private_server_key
ROBOFLOW_WORKSPACE=ivan-tadena
ROBOFLOW_WORKFLOW_ID=autogloss-binary-damage-deployment-1787502823460
ROBOFLOW_IMAGE_INPUT=image
ROBOFLOW_SUBTYPE_MODEL_ID=damage-classifier-o1i5b/3
```

Optional settings:

```dotenv
ROBOFLOW_API_URL=https://serverless.roboflow.com
ROBOFLOW_TIMEOUT_MS=20000
ROBOFLOW_MAX_RETRIES=1
ROBOFLOW_MIN_CONFIDENCE=0.36
ROBOFLOW_MAX_IMAGE_EDGE=1600
ROBOFLOW_SUBTYPE_ENABLED=true
ROBOFLOW_SUBTYPE_API_URL=https://serverless.roboflow.com
ROBOFLOW_SUBTYPE_TIMEOUT_MS=10000
```

Do not add any Roboflow variable to `frontend/.env`, and do not prefix it with `VITE_`, `NEXT_PUBLIC_`, or `EXPO_PUBLIC_`.

The subtype acceptance thresholds are approval gates fixed in backend code, not environment tuning values. If subtype enrichment is disabled, unavailable, malformed, below either gate, or unmapped, the API keeps the usable RF-DETR localization and returns `damageSubtype: "Unknown Damage"`. The enrichment branch always returns `component: "Unknown Vehicle Panel"`; no experimental vehicle-part model is trusted.

Approved customer-facing mappings:

- `car_scratch`, `deep_car_scratch`, `scuffed_paint` → `Scratch / Scuff`
- `car_dent` → `Dent`
- `cracked_bumper` → `Crack`

`chipped_paint` is temporarily withdrawn from the approved mappings and abstains as `Unknown Damage` with reason `unmapped_classifier_label`. The 2026-09-12 subtype calibration audit found the classifier returns `chipped_paint` for regions a human labelled Scratch / Scuff, including high-confidence, high-margin cases that neither acceptance gate can filter. The raw label is still reported in `subtypeAnalysis.rawClass` as diagnostic metadata. No replacement `Paint Damage` class is mapped in the meantime.

All other raw labels abstain as `Unknown Damage`. Raw classifier labels are diagnostic API metadata only and are never rendered in the customer UI. `confidence` remains RF-DETR localization confidence; `subtypeAnalysis.top1Confidence` is classifier confidence. Neither confidence value is severity. `affectedAreaPercent` and `detectedArea.percentage` are the segmentation mask area divided by total image area, not physical panel damage percentage and not severity.

Existing optional dependencies remain unchanged:

- MongoDB persists reports and provides a `scanId` to the 3D/AR stages.
- Cloudinary archives the uploaded scan image for Meshy.
- Meshy consumes the stored `scanId` through the existing `/api/ai/generate-3d-from-scan` flow.

## Multi-view guided inspection

`POST /api/ai/scan/batch` analyzes the guided vehicle views as a single inspection.
`POST /api/ai/scan` is unchanged and remains the single-image contract used by the web client.

Each guided image stays an independent inference input through the same pipeline: optimization,
RF-DETR Workflow, region parsing, localization quality gate, optional subtype classifier,
abstention, affected image area, and severity. Images are never stitched and never sent as one
detector input. Views are analyzed at most two at a time, and the per-region subtype classifier
calls within a view are bounded the same way.

Guided view identifiers reuse the existing capture angles and are also the per-damage
`angleHint`: `front`, `rear`, `left`, `right`, `close_up`. A guided view is a camera position,
not a vehicle component; `component` remains `Unknown Vehicle Panel`.

```bash
curl -X POST http://localhost:3000/api/ai/scan/batch \
  -H "Authorization: Bearer <optional-autogloss-jwt>" \
  -F "images=@/absolute/path/front.jpg" \
  -F "images=@/absolute/path/rear.jpg" \
  -F 'viewIds=["front","rear"]'
```

Validation returns 400 with a stable code for `IMAGE_REQUIRED`, `VIEW_IDS_REQUIRED`,
`VIEW_COUNT_MISMATCH`, `UNKNOWN_VIEW_ID`, and `DUPLICATE_VIEW_ID`. File count, size, and MIME
type are enforced by the same upload boundary as `/api/ai/scan`.

The response `data` is a superset of the single-scan payload, adding `inspectionId`,
`inspectionMode`, `inspectionSummary`, `views`, and `crossViewDeduplication`. Each damage gains
`sourceView` and keeps every existing field. The counts object is named `inspectionSummary`
rather than `summary` because `data.summary` is already the human-readable string every client
renders.

One failed view does not fail the inspection: that view returns `success: false`, a stable
`errorCode`, and the customer-safe message `This view could not be analyzed. Please retake or
upload it again.` A failed view is never counted as clean, and the aggregate summary appends
`Some views could not be analyzed and were not confirmed clean.` If every view fails, the
endpoint returns the same upstream status and code as a failed single scan.

`inspectionSummary.totalDetectedRegions` is a region count across views, not a unique-damage
count. No cross-view deduplication is performed: the application holds no deterministic
evidence that a region in one image is the same physical damage as a region in another, and
`crossViewDeduplication.applied` is always `false`. Consequently the estimator, which produces
one line item per detected region, appends a provisional assumption to `estimate.assumptions`,
the mobile estimate screen totals only user-selected line items, and each line item displays
the guided view its region came from.

The 3D flow is unchanged. The guided capture set is never sent to Meshy; 3D still requires the
separately chosen, separately validated full-vehicle photo.

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
4. Test a clear JPG/PNG/WebP vehicle image. Confirm the report shows mapped/abstained damage subtype, `Unknown Vehicle Panel`, detection confidence, affected image area, severity, segmentation overlay, and estimate.
5. Test a clean vehicle image. Confirm the scan completes with the cautious zero-prediction message rather than claiming the vehicle has no damage.
6. Test a text file renamed to `.jpg`; expect `INVALID_IMAGE` without a Roboflow request.
7. Test a file larger than 10 MB; expect a client or server size error.
8. Temporarily set `ROBOFLOW_TIMEOUT_MS=3000` and use a slow connection; confirm a retryable timeout message and HTTP 504.
9. Temporarily use an invalid key; confirm `ROBOFLOW_AUTH_FAILED` and that neither the response nor browser bundle contains the key.
10. For a persisted scan, call `GET /api/ai/scan/:scanId` and `/api/ai/webar-session/:scanId`; confirm normalized mask and area data are available to downstream modules.
11. Disable subtype enrichment or simulate a subtype request failure; confirm the RF-DETR damage remains usable with `Unknown Damage` and `Unknown Vehicle Panel`.

Automated parser/model tests run with:

```bash
node --test backend/tests/roboflowDamage.service.test.js
node --test backend/tests/multiViewInspection.test.js
node --test backend/tests/multiViewInspectionHttp.test.js
node --test backend/tests/concurrencyUtils.test.js
npm run test:multi-view-inspection --prefix mobile
npm run test:guided-views --prefix mobile
npm run typecheck --prefix mobile
npm run build --prefix frontend
```

The published localization Workflow is `autogloss-binary-damage-deployment-1787502823460`. It wraps `ivan-tadena/autogloss-vehicle-damage-2-rfdetr-seg-small-t1`, binds confidence to `0.36`, and returns `predictions` plus an optional rendered `output_image`. The backend excludes `output_image` and retains polygon points for the existing mobile overlay. The optional subtype classifier is a second stage only; RF-DETR does not directly predict component, subtype, severity, recommendation, or repair cost.
