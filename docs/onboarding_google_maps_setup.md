# Aera onboarding: Google Maps setup

The onboarding area step uses Google Maps for the interactive map and Google Places API (New) + Geocoding API for server-validated nearby neighborhoods and canonical address resolution. No key is committed. Google lists `neighborhood` as a response-only place type rather than a Nearby Search filter; the API requests real place types and the server keeps only actual results whose returned types include `neighborhood`. Empty results remain an honest provider outcome; no synthetic areas are added. See [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search) and [Place types](https://developers.google.com/maps/documentation/places/web-service/place-types).

## Required configuration

1. Create or select a Google Cloud project and enable **Maps SDK for Android**, **Maps SDK for iOS**, **Maps JavaScript API**, **Places API (New)**, and **Geocoding API**.
2. Configure billing and usage quotas/alerts. Google Maps Platform is usage-priced; each map load, place search, and geocoding request can incur charges under Google's then-current SKU pricing. Set quotas and budget alerts before production use.
3. Create **separate restricted keys**:
   - **Server key**: set `GOOGLE_MAPS_PLACES_API_KEY` in the API host's secret manager. Restrict it to Places API (New) and Geocoding API, and to the API host's static egress IPs where available. It is never sent to the Flutter app.
   - **Android SDK key**: set `GOOGLE_MAPS_API_KEY` in the build environment. Restrict to Maps SDK for Android and the released package name plus signing-certificate SHA fingerprints. Android Gradle injects it into the manifest.
   - **iOS SDK key**: set the Xcode build setting `GOOGLE_MAPS_API_KEY` for each build configuration and restrict to Maps SDK for iOS and the production bundle identifier. `Info.plist` passes the setting to AppDelegate.
   - **Web browser key**: replace `YOUR_GOOGLE_MAPS_BROWSER_KEY` in `web/index.html` at deploy time (or in the deployment template) with a key restricted by HTTP referrer and Maps JavaScript API.
4. Keep keys out of Git, crash reports, request logs, and client source control. Client SDK keys are visible in distributed apps and must rely on application/referrer restrictions and quotas, not secrecy.
5. Run onboarding after the migration `20261016050000_add_company_onboarding_profile` has been deployed. New registrations remain incomplete until the API validates all required records. Existing companies are marked complete by the migration to avoid blocking current accounts.

## Flutter build configuration

Step 02 starts with a visible **30 km** radius default (the user can change it from 10–50 km, matching Nearby Search's 50,000 m maximum circle). The map is centered only after a real saved, searched, or GPS location is selected. The map displays returned Google neighborhood locations as selectable center markers; Google Places does not supply authoritative service-boundary polygons in this integration.

- Android: expose the restricted SDK key as `GOOGLE_MAPS_API_KEY` to Gradle, and pass the same client key as a Dart define so Flutter knows the interactive map is configured:

  ```powershell
  $env:GOOGLE_MAPS_API_KEY = "YOUR_RESTRICTED_ANDROID_KEY"
  flutter build apk --dart-define="GOOGLE_MAPS_API_KEY=$env:GOOGLE_MAPS_API_KEY"
  ```

- iOS: set `GOOGLE_MAPS_API_KEY` in the Xcode build configuration, and pass the restricted iOS key as a Dart define:

  ```bash
  export GOOGLE_MAPS_API_KEY="YOUR_RESTRICTED_IOS_KEY"
  flutter build ios --dart-define="GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY"
  ```

- Web: substitute `YOUR_GOOGLE_MAPS_BROWSER_KEY` in `web/index.html` at deployment, then build with the same restricted browser key as a Dart define:

  ```bash
  flutter build web --dart-define="GOOGLE_MAPS_API_KEY=YOUR_RESTRICTED_BROWSER_KEY"
  ```

The Flutter `image_picker`, Google Maps, and Geolocator dependencies are declared in `pubspec.yaml`/`pubspec.lock`. `GOOGLE_MAPS_PLACES_API_KEY` is a separate server-only secret; do not reuse a browser/mobile key for backend Places/Geocoding requests.

## Fallback behavior

Without `GOOGLE_MAPS_PLACES_API_KEY`, nearby-zone lookup and saving the service area return an explicit `MAPS_PROVIDER_NOT_CONFIGURED` error. The API does not create example neighborhoods or accept a client-supplied label as a verified zone. A missing client SDK key leaves the map unavailable and should be treated as a deployment configuration failure, not silently bypassed.
