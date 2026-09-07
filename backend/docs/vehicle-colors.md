# Vehicle color intelligence

AutoSPF+ stores global factory-paint records in the MongoDB `vehicle_colors`
collection. The collection is the project equivalent of the requested
`vehicle_colors` table and keeps the requested brand, model, year, factory
name, standard color, paint code, finish, HEX, RGB, and availability fields.

## Resolution order

1. Exact brand + model + year + factory color name and/or paint code match.
2. The color selected or typed by the user.
3. `Not specified` when neither source contains usable color data.

`Unknown`, `Unknown color`, `N/A`, and similar legacy placeholders are treated
as missing data. They are never returned as a vehicle color.

## Global imports

OEM paint catalogs are provider data and must include provenance. Import only
licensed, verified records; the application does not fabricate OEM coverage.
For large catalogs, use newline-delimited JSON so the importer can stream the
file without loading it into memory:

```bash
npm run import:vehicle-colors -- --file=/absolute/path/colors.ndjson
npm run import:vehicle-colors -- --file=/absolute/path/colors.ndjson --apply
```

The first command validates only. `--apply` writes in indexed batches of at
most 1,000 records. JSON arrays are accepted for smaller catalogs.

Example record:

```json
{
  "vehicle_brand": "Toyota",
  "vehicle_model": "Corolla",
  "year": 2025,
  "factory_color_name": "Celestite Gray Metallic",
  "standard_color": "Gray",
  "paint_code": "1K3",
  "finish_type": "Metallic",
  "hex_color": "#6F7478",
  "rgb_value": "111,116,120",
  "availability": "available",
  "regions": ["PH"],
  "provider": "licensed-oem-catalog",
  "source_id": "toyota-corolla-2025-1k3",
  "source_url": "https://provider.example/record/123",
  "license": "Provider contract reference"
}
```

## API

- `GET /api/vehicle-intelligence/colors/categories`
- `GET /api/vehicle-intelligence/colors?brand=Toyota&model=Corolla&year=2025`
- `GET /api/vehicle-intelligence/colors/resolve?brand=Toyota&model=Corolla&year=2025&color=Celestite%20Gray%20Metallic`
- `GET /api/vehicle-intelligence/colors/coverage` (administrator)
- `POST /api/vehicle-intelligence/colors/import` (administrator, 1,000 records per request)

The normal add/edit vehicle endpoints automatically call the same resolver, so
web and mobile clients receive identical color fields.

## Existing vehicles

Run `npm run migrate:vehicle-colors` for a read-only report, then add `--apply`
to normalize legacy values and attach newly imported exact OEM matches. A
legacy `Unknown` value becomes `Not specified`; lost historical selections
cannot be reconstructed without another trustworthy data source.
