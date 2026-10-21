# Aera onboarding: OpenStreetMap setup

The onboarding area step uses OpenStreetMap (OSM) for the interactive map and OSM services for server-validated nearby neighborhoods and canonical address resolution. No API keys are required. This eliminates Google Maps Platform billing and dependencies.

## Required configuration

### Backend environment variables (all optional with defaults)

The backend uses three optional environment variables (documented in `backend/.env.example`):

- `OSM_USER_AGENT`: Identifies the client to OSM services (required by usage policy). Default: `"AeraFieldService/1.0 (+https://quantixlabs.live)"`
- `NOMINATIM_BASE_URL`: Nominatim geocoding service base URL. Default: `"https://nominatim.openstreetmap.org"`
- `OVERPASS_BASE_URL`: Overpass API base URL for neighborhood discovery. Default: `"https://overpass-api.de/api/interpreter"`

### Flutter build configuration

- Android/iOS/Web: No Maps SDK key is required. The map renders OSM raster tiles by default.
- Optional: Set `MAP_TILE_URL` as a Dart define to use a custom tile provider (recommended for production scale):

  ```bash
  flutter run --dart-define=MAP_TILE_URL=https://your-tile-provider.com/{z}/{x}/{y}.png
  ```

The default tile URL is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. This is suitable for development and light use, but not for production scale.

## Usage policies and rate limiting

The backend implements the following per OSM service policies:

### Nominatim (geocoding)
- **Rate limit**: Max 1 request/second (backend enforces ≥1.1s between requests)
- **No autocomplete/search-as-you-type**: Search only on explicit submit (Flutter enforces this)
- **Caching**: Results cached for 24 hours (in-memory, single-process)
- **Attribution**: Required in UI (Flutter displays "OpenStreetMap contributors" with copyright link)

### Overpass API (neighborhood discovery)
- **Rate limit**: Fair use (backend enforces ≥1.1s between requests)
- **Query timeout**: 20 seconds
- **Result size**: Limited to 100 elements per query
- **Caching**: Results cached for 10 minutes (in-memory, single-process)
- **Place types**: Searches for `suburb`, `neighbourhood`, `quarter`, `city_district` with fallback to `town`, `village`, `hamlet`, `locality`

### OSM tile server
- **Rate limit**: Fine for development and light use
- **Production**: Use a hosted tile provider (e.g., Mapbox, CartoDB, or self-hosted) for production scale
- **Attribution**: Required in UI (Flutter displays attribution widget)

The backend uses:
- Per-host serial queue (≥1.1s between consecutive requests to the same host)
- In-memory caching with TTL (geocode: 24h, neighborhoods: 10min)
- `AbortSignal.timeout` (20s) for all requests
- User-Agent header on every request

## Architecture notes

- **Single-process only**: The in-memory throttle/cache works for one systemd service instance. Do not add Redis for multi-process scaling without a full redesign.
- **No API keys**: OSM services are free and public; no keys are stored or committed.
- **Fallback behavior**: Network failures return `MAPS_PROVIDER_UNAVAILABLE` (502). Invalid coordinates return `LOCATION_NOT_RESOLVED` (422). Empty neighborhood results return an empty list (the app instructs users to add custom areas).

## Legacy Google Maps data

Existing companies with Google place IDs (place IDs not starting with `osm:` or `custom:`) are treated as custom areas on load in Flutter. This prevents save failures for already-onboarded companies. Old Google IDs are not migrated; users can re-select neighborhoods when they next edit their service area.

## Production recommendations

1. **Tile provider**: Switch from the public OSM tile server to a hosted provider (Mapbox, CartoDB, MapTiler, or self-hosted tiles) for production scale and reliability.
2. **Self-hosted Nominatim/Overpass**: For high traffic, consider self-hosting Nominatim and Overpass with proper infrastructure and rate limiting.
3. **Monitoring**: Monitor OSM service response times and errors. The backend logs failures without exposing request bodies.
4. **Attribution**: Keep the OpenStreetMap attribution visible in the UI as required by the OSM license.

## Out of scope (remain unchanged)

The following Google services are **not** part of this migration and remain in the project:
- Google Gemini AI (`GEMINI_*` env vars, `backend/src/modules/ai/gateway/gemini.client.ts`)
- Firebase Cloud Messaging (`FIREBASE_*` env vars, `fcm-push.adapter.ts`)
- Google Fonts Flutter package (`google_fonts` in `pubspec.yaml`)
- Google Maven repositories in Android Gradle files
