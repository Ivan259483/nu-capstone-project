# AutoSPF+ Vehicle Intelligence

This foundation separates vehicle identity, physical body type and AutoSPF+ pricing policy. An SUV is not automatically assigned a luxury-sedan rate because of its brand, and a fuel type never determines a price. Prices still come from the existing SPF service pricing catalog.

## Data and classification

The global identity catalog is normalized into four MongoDB collections. It is separate from the operational `vehicles` collection and the immutable AutoSPF+ pricing policy in `VehicleDefinition`.

| Requested table | MongoDB collection/model | Stored fields |
| --- | --- | --- |
| manufacturers | `manufacturers` / `VehicleManufacturer` | brandName, country, logo, status, aliases, provider keys and source provenance |
| vehicle_models | `vehicle_models` / `VehicleCatalogModel` | manufacturerId, modelName, generation, productionStart/End, bodyType, vehicleClass, segment, fuel/drive/transmission arrays, regions and provider identity |
| vehicle_variants | `vehicle_variants` / `VehicleVariant` | modelId, variantName, engine, year/range, hybrid/electric, fuel, drive, transmission and optional variant-level body classification |
| vehicle_classification | `vehicle_classification` / `VehicleClassification` | canonical class code, body type, vehicle class, description and status |

The importer accepts the 18 physical classes requested by the product: Hatchback / Small Car, Sedan, Liftback / Fastback, Coupe, Convertible / Roadster, four SUV sizes, two pickup sizes, MPV / Minivan, Passenger Van, Commercial Van, Sports Car, Supercar, Hypercar and Luxury Sedan. It rejects invented class names. Provider body descriptions remain independent, so values such as `4-Door Sedan` and `Crossover SUV` can be retained without expanding the canonical class list.

An exact brand + model + optional year/generation query can enrich the response with physical body type, class and segment. Multiple body styles for the same unresolved identity return `ambiguous`; they are never collapsed to the first result. A physical catalog record never assigns an AutoSPF+ price on its own. `VehicleDefinition` or an audited administrator override remains the only authority for `pricingCategory` and Recommended Service Category.

`VehicleDefinition` stores immutable MongoDB revisions. Each definition represents a brand/model/generation/facelift and a bounded model-year range; separate records can describe fuel or drivetrain variants. Fields:

| Field | Meaning |
| --- | --- |
| brand, model | Exact normalized identity; no substring/fuzzy price assignment |
| generation, facelift | Optional generation and refresh identifiers |
| yearFrom, yearTo | Inclusive model-year coverage; publication requires a finite yearTo |
| bodyType | Physical body style, independent of commercial price grouping |
| vehicleCategory | Business classification label |
| pricingCategory | An existing price code or OTHER |
| fuelType | Gasoline, Diesel, Electric, Hybrid, PHEV, HEV, MHEV, BEV, FCEV; definitions also permit future terminology |
| drivetrain, sizeSegment | Optional verified technical metadata |
| confidenceLevel | low, medium, high; only reviewed high-confidence definitions can quote |
| status | draft, approved, retired |
| sources, reason | Evidence references and change rationale |
| reviewExpiresAt | Mandatory future review deadline for approval |
| definitionKey, revision, authoredBy, createdAt | Identity, version and audit trail |

Unknown technical fields remain blank. Do not infer physical body style from a pricing label (for example, a coupe can have High-end Sedan pricing).

Selection uses brand + model first. Optional year/generation/facelift/fuel/drivetrain narrow candidates. If all eligible records agree on body type, vehicle category and price category, classification succeeds. Conflicts, unsupported years, overlapping drafts/retirements, missing approval, expired reviews or Other return `review_required` with a null price category. When different generations agree on pricing, brand + model alone is sufficient; differing technical fields remain unspecified.

A new database family supersedes its bootstrap mapping, including retirement. Updates never reactivate an old approved revision. Every save inserts a new revision; a unique `(definitionKey, revision)` index rejects concurrent stale updates. Ensure the model indexes are created during deployment. The immutable revision approach retains history without an ever-growing audit array in each definition. MongoDB/Mongoose concurrency reference: https://mongoosejs.com/docs/7.x/docs/tutorials/findoneandupdate.html.

## Pricing categories

| Requested label | Existing price code |
| --- | --- |
| SUV | SUV |
| Hatchback | HATCHBACK_SMALL_CAR |
| Sedan | SEDAN |
| Midsize | MIDSIZED |
| Large SUV / Van | LARGE_SUV_VAN |
| High-end Sedan | HIGH_END_SEDAN |
| Other | OTHER; registration only, no invented price |

Existing `PICKUP` pricing remains supported for backward compatibility. Other does not silently fall back to Sedan or Pickup. An administrator must assign an existing approved tier, or a separate business-approved price catalog change must introduce a priced Other tier.

## Bootstrap scope

The three owner-supplied mappings work immediately:

- Bentley Bentayga → SUV → SUV pricing
- Alfa Romeo Giulietta → Hatchback → Hatchback pricing
- BMW 7 Series → Sedan body / Highend Sedan vehicle category → HIGH_END_SEDAN pricing

Their bootstrap coverage ends at model year 2026 and expires on September 6, 2027. They are business mappings from the owner's request, not a manufacturer specification dataset. Fuel, drivetrain, size and generation are intentionally unspecified. All other legacy brand/model names remain searchable, but their old heuristic matches are not approved pricing evidence. Add reviewed database definitions to activate automatic pricing for them. No complete manufacturer catalog or unattended external data feed is claimed.

## Authenticated API

Base path: `/api/vehicle-intelligence`. Every endpoint requires the existing signed-in session. Writes, history, definitions and review queue require the canonical `administrator` role; customer, sales and office_admin cannot publish or override.

| Method and path | Purpose |
| --- | --- |
| GET /catalog | Existing searchable names plus new database model families |
| GET /classify?brand=BMW&model=7%20Series | Classification and available generation choices; optional year, generation, facelift, fuelType, drivetrain, bodyType |
| GET /definitions?brand=BMW&model=7%20Series | Latest revisions; 100 per page, `after=nextCursor` |
| POST /definitions | Create a definition; generated key and revision 1 returned |
| PUT /definitions/:key | Full replacement definition + expectedRevision; inserts next revision |
| GET /definitions/:key/history | Historical revisions; `beforeRevision=nextCursor` |
| GET /review-queue | Scan 50 saved vehicles per page against the current catalog; `after=nextCursor` |
| PUT /vehicles/:id/override | Assign a verified price tier to a saved vehicle with a reason and expectedVersion |

Review queue pages can be empty while nextCursor is present; continue until null. This catches stale saved classifications as well as unknown vehicles. A vehicle's `__v` from this queue is the override's `expectedVersion`.

Example definition body (technical facts deliberately unspecified):

```json
{
  "brand": "Bentley", "model": "Bentayga", "generation": "", "facelift": "",
  "yearFrom": null, "yearTo": 2026,
  "bodyType": "SUV", "vehicleCategory": "SUV", "pricingCategory": "SUV",
  "fuelType": "", "drivetrain": "", "sizeSegment": "",
  "confidenceLevel": "high", "status": "approved",
  "sources": ["AutoSPF+ owner classification instructions, 2026-09-06"],
  "reviewExpiresAt": "2027-09-06T00:00:00Z",
  "reason": "Publish the owner-approved SUV pricing mapping"
}
```

Override body:

```json
{ "pricingCategory": "SUV", "expectedVersion": 0, "reason": "Inspected and verified against the approved pricing policy" }
```

Overrides record actor, timestamp, reason, previous category and vehicle identity. Ordinary color/plate edits retain approval. Changing make, model, year, generation, facelift, fuel or drivetrain invalidates it and reclassifies. Conflicting edits return HTTP 409. Customer-provided pricing categories never create an override.

## Continuous update workflow

1. Collect a new release/facelift's manufacturer evidence and approved AutoSPF+ pricing policy. Add a new definition with status draft; no code deployment is needed.
2. Record explicit model-year coverage and technical metadata. Add distinct generations/variants when body or pricing changes. Never extend a generation into future years without review.
3. An administrator verifies evidence and publishes high-confidence approved records with a review deadline. Correct an existing record using expectedRevision; retire obsolete/error records using status retired.
4. Customer form mounts read the live catalog. Brand/model/year/generation changes trigger a fresh server classification. Old requests are cancelled and their responses cannot overwrite the new selection.
5. Booking options and SPF order creation resolve the latest definition again. Existing completed bookings and price snapshots are not repriced. New snapshots record the classification revisions or admin override source used.

Batch JSON validation/import:

```sh
node backend/scripts/import-vehicle-definitions.js --file=definitions.json
```

This is a dry run. For publishing, set `VEHICLE_INTELLIGENCE_API_URL` to the backend base ending in `/api`, set `VEHICLE_INTELLIGENCE_ADMIN_TOKEN` to an administrator session token, and add `--apply`. Never commit tokens. A remote endpoint requires HTTPS. Updates in a batch must include definitionKey and expectedRevision. Each record is independently committed; on failure the script stops and reports the failed position. Reload revisions before retrying a partial batch. Scheduled provider imports can use this same API to submit drafts, but a licensed provider/feed and scheduling are not configured by this change.

## Rollout and validation

This change does not seed or rewrite a live database. Mongoose creates the new collection/indexes as definitions are published; existing vehicle data is retained. Unknown and unreviewed legacy vehicles may now need admin review before their next booking. Review/approve the relevant fleet through the queue before rollout. Customer Garage registration remains available while pricing is pending. Administration remains available through the authenticated API/import workflow. Web customer Add/Edit and Expo Add/Edit share the same catalog names, classification request state transitions and backend authority. Their classification field is read-only; unknown vehicles can be saved for review.

Focused checks:

```sh
node --test --test-concurrency=1 backend/tests/vehicleIntelligence.test.js backend/tests/customerBookingVehicleResolution.test.js backend/tests/servicePricing.test.js
npm run build --prefix frontend
```


## Catalog consolidation (2026-09-07)

`constants/vehicleDatabase.js` contains one brand/model-keyed `vehicleClassificationMap`: 628 selectable models, 304 established explicit AutoSPF+ pricing mappings and 324 null mappings awaiting business review. `brandModels` and compatibility display helpers are derived from it. The old model keyword heuristics were removed rather than promoted into approved prices. Acura Integra/MDX have no established mapping in this repository and therefore remain review-required. The existing `PICKUP` tier is preserved; it must not be folded into SUV.

`resolveVehicleClassification(brand, model)` resolves this repository baseline. It normalizes Unicode, case, punctuation, whitespace and explicit brand aliases (Mercedes/Benz and VW), requiring both brand and model. It is not a substitute for `classifyVehicle`: the server wraps the baseline in bounded definitions and applies live administrator revisions and overrides before any quote. Customer clients call `/classify`; they never locally approve a pricing tier.

Both clients share `constants/vehicleFormState.js`. Brand/model changes synchronously clear old model/variant/category state. Requests begin as loading, are abortable, and compare the complete identity before updating state. Unknown/API-failure results carry no price. On Edit, `/classify?vehicleId=...` checks ownership and preserves a legitimate unchanged administrator override; changing identity invalidates it. Backend Add/Edit independently resolve again and ignore submitted tiers. Invalid/empty make/model, oversized identity metadata and malformed years receive 422.

Existing records are resolved on reads without database writes; edits persist the effective classification on the same vehicle. Duplicate-plate Add responses also resolve the existing vehicle's identity rather than the submitted replacement identity. Garage reads load administrator definitions once for the request. Historical booking snapshots remain unchanged.

See [coverage and every unclassified model](vehicle-classification-coverage.md). `node backend/scripts/vehicle-classification-coverage.js --database` audits configured saved vehicles read-only. No migration is required. Mobile Metro watches the pure shared constants directory; restart an already-running Metro instance after adding this configuration.
