# SangamSetu CSV Ingestion Guide

This gives you a simple path to load the CSV files in `/data` into Supabase so the frontend reflects them.

## 1. Run the schema SQL first

Run these in the Supabase SQL editor:

1. `supabase/phase1_setup.sql`
2. `supabase/phase2_setup.sql`

## 1.5 Add your Mapbox token

To enable the Phase 2 map in the frontend:

1. Create a `.env` file in the project root if you do not already have one
2. Copy values from `.env.example`
3. Set `VITE_MAPBOX_ACCESS_TOKEN` to your Mapbox public token

Without this token, the `Operations` tab will still load summaries but the map itself will stay disabled.

## 2. Import the geography CSVs with the Supabase Table Editor

For each CSV:

1. Open `Table Editor` in Supabase.
2. Select the target table.
3. Click `Insert` -> `Import data from CSV`.
4. Upload the matching file from this repo's `data/` folder.

Use this mapping:

| CSV file | Supabase table |
|---|---|
| `data/Zone_Boundaries.csv` | `zone_boundaries` |
| `data/CCTV_Locations.csv` | `cctv_locations` |
| `data/Police_Stations.csv` | `police_stations` |
| `data/Chokepoints_Parking.csv` | `chokepoints_parking` |

The column names already match the table definitions, so Supabase should map them directly.

## 3. Ready-to-import demo report files

This repo now includes two transformed files derived from `data/Synthetic_Missing_Persons_2500.csv`:

| File | Use |
|---|---|
| `data/reports_import_missing.csv` | Import into `reports` as missing-person rows |
| `data/reports_import_found.csv` | Import into `reports` as found-person rows |

These files already:

- rename `missing_person_name` to `name`
- include the required `report_type` column
- keep only columns that belong in the `reports` table

Recommended import order:

1. Import `data/reports_import_missing.csv` into `reports`
2. Import `data/reports_import_found.csv` into `reports`

This gives you both missing and found records, so the `possible_report_matches` view in the `Operations` tab can show candidate matches.

## 4. Optional: build your own transformed report import

If you want to create your own custom import version instead:

1. Open `Table Editor` -> `reports`
2. Import `data/Synthetic_Missing_Persons_2500.csv`
3. Map the CSV columns like this:

| CSV column | reports column |
|---|---|
| `reported_at` | `reported_at` |
| `missing_person_name` | `name` |
| `gender` | `gender` |
| `age_band` | `age_band` |
| `language` | `language` |
| `last_seen_location` | `last_seen_location` |
| `reporting_center` | `reporting_center` |
| `reporter_mobile` | `reporter_mobile` |
| `physical_description` | `physical_description` |
| `status` | `status` |
| `remarks` | `remarks` |

Important:

- The original synthetic CSV does **not** contain `report_type`, so you must supply one.
- For a fast demo, the prebuilt transformed files in this repo are easier than editing manually.
- If you want a different split, edit the source CSV in a spreadsheet and create your own import files.

## 5. How this reflects on the frontend

After import:

- `All reports` reflects rows in `reports`
- `Operations` reflects rows in `zone_boundaries`, `cctv_locations`, `police_stations`, and `chokepoints_parking`
- The new Mapbox operations map plots imported zones, CCTV, police stations, and chokepoints directly from those tables
- `Operations` also reads `possible_report_matches`, which is generated from the `reports` table
- Report markers appear on the map when `last_seen_location_lookup.lat/lng` or `reporting_center_lookup.lat/lng` are populated

If the frontend is already open, refresh once after the first import. After that, report inserts and updates still use Realtime as before.
