# AIRGUARD AI: FINAL BUILD (all tabs)

Servers are already running: do NOT start them. Follow CLAUDE.md and its DESIGN RULES (flat, plain, no gradients, no decorative icons or emoji, plain wording, nothing the user doesn't need). ONE small file per tool call. Every user-facing string goes in en.json, hi.json and te.json (natural Hindi and Telugu). Work through the PHASES in order. After each phase run the frontend build and backend pytest and fix errors before moving on. If you run out of room, stop cleanly and say which phase you finished.

Rules: never invent data. AQI data is labelled "Modelled estimate". Citizen reports show "Unverified" until an officer changes the status. No secrets in code; officer credentials come from backend/.env. Do not show report codes to citizens anywhere in the UI.

## PHASE 1: Reports fixes
Backend:
1. Raise the POST /api/reports limit to 10 per hour per IP.
2. GET /api/reports/map must return, per report: code, category, title, latitude, longitude, activity_status, review_status, created_at, and photo_url (e.g. /api/reports/photo/<filename>) of the first photo or null. Add GET /api/reports/by-codes?codes=a,b,c (max 20) returning the same fields plus all photo_urls, place_name, description and status history. Make sure photos are served correctly through the Vite proxy.
Frontend (ReportPage):
3. Split into two sub-tabs inside the Report page: "New report" and "My reports".
4. Remove the duplicated heading in step 3 (one label only). Keep the 3 steps.
5. After a successful submit: save {code, savedAt} to localStorage key "myReports", show a simple success screen: "Report sent. It now appears on the map." with two buttons: "See it on the map" (navigates to /map and focuses that report) and "My reports". NEVER show the code.
6. "My reports": load by-codes for the saved codes. For each report show photo thumbnail, title, category, place, date, "Unverified" until review status changes, the activity status ("Reported by you") and the review status in plain words ("Waiting for review", "Being reviewed", "Action planned", "Resolved", "Rejected"), plus the history timeline with officer notes. Empty state: "You have not reported anything on this device yet." plus a button to report. Add a small note: "Your reports are saved on this device."
7. Remove the old /track pages and links.

## PHASE 2: Map
8. MapPage: fetch /api/reports/map on mount, every 30 seconds, and when arriving from a new report; no stale data. A new report must appear without a page reload. When arriving with a focus parameter, centre on that report and open its popup.
9. Report popup: photo (img, max height 160px, alt text), category, title, date, activity status, review status, "Unverified" label until reviewed. Show a friendly text if the photo fails to load.
10. Keep the air-quality marker and the filter chips (All, Active only, one per category). Make the report markers clearly visible (coloured by category-free neutral shape, larger and not grey; red outline when active).
11. Below the map add "Recent reports": newest 10 for the visible filter as simple rows with thumbnail, title, category, place, time ago and status. Clicking a row centres the map and opens its popup. Empty state: "No reports here yet. Be the first to report." with a link.
12. Add a small sub-tab on the Map page: "Air map" and "Routes" (Routes is built in PHASE 6).

## PHASE 3: AI forecast (backend)
Use Open-Meteo past data. In services/open_meteo.py add get_history(lat, lon, days=60) calling the air-quality API with past_days=60, forecast_days=0, hourly pm2_5, pm10, nitrogen_dioxide, ozone, sulphur_dioxide, carbon_monoxide, timezone=auto, cached 6 hours.
Create backend/app/ml/ (with __init__.py):
- features.py: build an hourly AQI series using the existing calculate_aqi_for_hour (CPCB averaging, past data only). Features at time t: AQI at lags 0,1,2,3,6,12,24 hours, rolling mean 24h, hour of target time, day of week of target time, horizon h. Target: AQI at t+h. Build rows for horizons [1,3,6,12,18,24,36,48]. Drop rows with missing values. No future leakage.
- train.py: chronological split 70% train, 15% validation, 15% test (never random). Train RandomForestRegressor (small, e.g. 150 trees, max_depth 12, n_jobs=1). Baselines on the same test rows: persistence (AQI now) and same-hour-yesterday. Compute MAE and RMSE on the test set for the model and both baselines, plus MAE by horizon bucket (up to 6h, 7-24h, 25-48h). Pick the best by validation MAE. Save model and metrics with joblib under backend/models/ keyed by rounded lat/lon (git-ignored). Train in a background thread so requests never block.
- predict.py: forecast hourly AQI for the next 48 hours from the latest data using the saved model. If fewer than 14 days of data or no model yet, return status "not_ready".
Endpoints in api_forecast.py (register in main.py):
- GET /api/forecast/status?lat&lon: not_ready/training/ready.
- GET /api/forecast?lat&lon: starts training in the background if no model; returns, when ready: hourly "ai" points (time, aqi, category), hourly "atmospheric" points (Open-Meteo's own forecast converted to AQI with the same calculator; increase get_air_quality forecast_days to 3 if needed), the past 24 hours observed, best and worst windows (2-hour blocks) from the AI forecast, and metrics.
- GET /api/forecast/evaluation?lat&lon: model vs baselines MAE and RMSE, test period dates, number of test rows, which model was selected, and a plain flag "beats_baseline" true/false. Only real computed numbers. Add pytest tests for the feature builder (no leakage) and the metric calculation. Add backend/models/ to .gitignore.

## PHASE 4: Forecast page (frontend)
13. ForecastPage: uses the selected city (useLocation). While status is training show a skeleton and "Preparing the forecast for this city, about a minute", polling status every 5 seconds; error state with Retry.
14. Show: a one-line summary ("Air is expected to be Poor from 6 PM to 11 PM" or "Air should stay Moderate for the next 24 hours"); a 48-hour colour timeline strip (one block per 3 hours with the AQI category colour and category word available on tap) marking best and worst windows; one Recharts line chart with past 24 hours solid, AI forecast dashed, and the atmospheric forecast as a thin grey line, legend labelled "AirGuard AI forecast" and "Atmospheric model forecast". Label everything "Forecast, not a measurement".
15. Collapsed section "How reliable is this?" showing in plain words: average error of our model vs simply assuming "same as now", in AQI points, with the test period; if beats_baseline is false say honestly that our model does not beat the simple baseline. Mention it learns from modelled data for this city and forecasts further ahead are less certain.
16. Profile-aware advice sentence for the forecast (reuse advice.ts).

## PHASE 5: Alert bell
17. Create an AlertsProvider (React context) wrapping the app. Alerts are stored in localStorage key "alerts" with: id, type (high_aqi, forecast, report_update), title, message, place, value, time, read. Deduplicate by type + place + date (+ category/status). Keep the last 30.
18. Checks run on app load and every 10 minutes for the selected city: (a) high_aqi when the current AQI is 201 or above ("Air is Poor/Very Poor in <city> now"), labelled as modelled; (b) forecast when the AI forecast shows 201 or above in the next 24 hours, clearly labelled "Forecast"; (c) report_update when a report in "myReports" has a review status different from the last seen one.
19. Layout bell: unread count badge, dropdown list (newest first) with title, place, time, one recommended action, source ("Modelled estimate" or "Forecast"), click to mark read, "Mark all as read" and "Clear". Empty state: "No alerts right now." Works on mobile (full-width sheet). Accessible labels, translated.

## PHASE 6: Route planner (Map > Routes), lite
Backend api_routes.py: GET /api/routes?from_lat&from_lon&to_lat&to_lon calls the public OSRM demo server (https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}?alternatives=true&overview=full&geometries=geojson) with a 10 s timeout and a clear error if it fails (say it is a demo routing service). For up to 3 routes, sample a point about every 5 km along the geometry, get the air quality AQI at each (use the cached get_air_quality, rounded coordinates) and compute the average AQI and an exposure score = average AQI x duration in hours. Return duration, distance, average AQI, exposure level Low/Medium/High (relative to the other routes and AQI categories) and which route has the lowest exposure. Traffic is NOT live: do not claim it; note that duration is a typical estimate.
Frontend: From and To use the same place search (and "Use my location"); show up to 3 routes as coloured polylines on a react-leaflet map with a list: time, distance, exposure level; badge "Lower exposure route" on the best with one plain reason; if routes differ little say "The difference is small". Note: "Air data is a coarse modelled estimate (about city level), so small differences between routes are not reliable." Never say "pollution-free". Translate all text.

## PHASE 7: Officer review (lite)
Backend: add PyJWT to requirements and install it. Read OFFICER_USERNAME, OFFICER_PASSWORD, JWT_SECRET from backend/.env (add placeholders to .env.example; never hardcode). If unset, login returns 503 "Officer login is not configured". POST /api/officer/login (compare with hmac.compare_digest, rate limit 10 attempts per 15 minutes per IP, return a JWT valid 8 hours). Protected endpoints (Bearer token): GET /api/officer/reports (filters category, review_status, active, city text; counts per review status), PATCH /api/officer/reports/{code}/status with a required note, allowed transitions only: submitted->under_review|rejected; under_review->action_planned|resolved|rejected; action_planned->resolved|under_review; resolved->under_review. Every change adds a ReportStatusHistory row. Citizens and anonymous requests get 401/403. pytest tests for auth and for forbidding citizen status changes.
Frontend: route /officer (link only as a small footer text "Officer login"): login form; then counts (Waiting, Being reviewed, Action planned, Resolved), a filterable table (category, status, active, date), a detail panel with photos, description, activity status and a form to change status with a required note. Translate it.

## FINISH
20. Run "npm run build" and backend pytest; fix all failures. Make sure .gitignore covers backend/models, backend/uploads and .env. Then stop and report: what passed, what is incomplete, and the exact backend/.env variables I must set.