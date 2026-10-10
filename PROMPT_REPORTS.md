# REPORTS + MAP (backend and frontend)

Servers are already running. Do NOT start them. Follow CLAUDE.md and its DESIGN RULES. ONE small file per tool call. All user-facing text goes in en.json, hi.json, te.json (natural Hindi and Telugu). Reports are labelled "Unverified". Show nothing the user does not need.

## BACKEND
1. backend/app/models.py (SQLAlchemy, Base from database.py): Report (id, report_code unique like AG-2026-XXXX random alphanumeric, category, title, description, place_name, latitude, longitude, activity_status, review_status default "submitted", created_at, updated_at); ReportPhoto (id, report_id FK, filename random, created_at); ReportStatusHistory (id, report_id FK, previous_status, new_status, note, created_at).
2. backend/app/config_reports.py: categories and allowed activity statuses: construction_dust (ongoing, paused, completed, not_sure); waste_burning (burning_now, fire_out, ash_remaining, not_sure); waste_dumping (uncollected, collection_in_progress, cleared, not_sure); traffic (heavy_jam, recurring, cleared, not_sure); industrial_smoke (emitting_now, stopped, recurring, not_sure); road_dust (dust_visible, road_repair, fixed, not_sure); other (happening_now, stopped, not_sure). Review statuses: submitted, under_review, action_planned, resolved, rejected. "Active" statuses = ongoing, burning_now, ash_remaining, uncollected, collection_in_progress, heavy_jam, recurring, emitting_now, dust_visible, road_repair, happening_now.
3. backend/app/schemas.py (Pydantic): title 3-100 chars, description max 1000, lat -90..90, lon -180..180, category and activity_status must match.
4. backend/app/api_reports.py router: POST /api/reports (multipart, up to 3 photos; validate real content by JPEG/PNG/WebP magic bytes, max 5 MB each, random filenames into backend/uploads; review_status always "submitted"; add first history row; return report_code; max 5 reports per hour per IP, else 429); GET /api/reports (limit, offset, filters category, review_status, active); GET /api/reports/map (code, category, title, lat, lon, activity_status, review_status, created_at, first photo); GET /api/reports/config (categories with their activity statuses); GET /api/reports/{report_code} (full report, photos, history); GET /api/reports/photo/{filename} (only existing files in uploads, reject path tricks).
5. Register the router in main.py, create tables on startup.
6. backend/tests/test_reports.py: valid report, bad category/status pair, bad file type, oversize file, rate limit, always "submitted". Run pytest with backend/venv/Scripts/python -m pytest and fix failures.

## FRONTEND: REPORT FORM (pages/ReportPage.tsx)
7. Three steps with a simple progress line, no login:
   Step 1: category choice as large text rows (no emoji), with 2-3 short tips for the chosen category.
   Step 2: location: "Use my location" (permission, friendly message if denied), or tap on a small react-leaflet map (OpenStreetMap, attribution), or type the area name. Default view: the selected city from useLocation.
   Step 3: activity status options for that category (translated), up to 3 photos with preview, title, description. Safety note: do not approach fires or dangerous sites; avoid photographing faces or number plates.
   Use React Hook Form + Zod (install if missing). Friendly validation messages. Submit with axios multipart. Success screen shows the report code with a Copy button and a link to track it. Note: "Reports stay in the language you wrote them in."
8. Translate all categories, activity statuses and review statuses in the three locale files.

## FRONTEND: TRACKING (pages/TrackPage.tsx, route /track/:code and /track)
9. Input for the report code; shows category, place, date, "Unverified" label until review status changes, activity status (reported by citizen), review status (set by authorities), photos, and the status history timeline with notes. Friendly not-found message. Add the route in App.tsx and a "Track my report" link on the report page.

## FRONTEND: MAP (pages/MapPage.tsx)
10. react-leaflet map with OpenStreetMap tiles and attribution, centred on the selected city.
11. Air marker for the selected city: coloured circle with the AQI number and category word, popup with "Modelled estimate" and time (data from /api/aqi/current).
12. Report markers (different shape) from /api/reports/map: popup with category, date, activity status, review status, short title, first photo if any, and the "Unverified" label.
13. Filter chips: All, Active only, plus one chip per category. Empty state: "No reports here yet. Be the first to report." with a link to the Report page. On narrow screens the map fills the width and the chips scroll horizontally.
14. Fix the default Leaflet marker icon issue with Vite if it appears.

## FINISH
15. Run "npm run build" in frontend and pytest in backend. Fix all errors. Then stop and report what passed and anything incomplete.