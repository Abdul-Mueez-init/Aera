# Sentry CI/CD Configuration

This document provides guidance for configuring Sentry symbol upload and release hygiene in CI/CD pipelines.

## CI/CD Configuration Requirements

### 1. Secrets Configuration

The following secrets must be configured in your CI/CD platform:

**Flutter Symbol Upload:**
- `SENTRY_ORG_AUTH_TOKEN`: Sentry organization auth token (required for symbol upload)
  - Generate in Sentry: Settings > Auth Tokens > Create New Token
  - Required scopes: `project:releases`, `project:write`
  - Do NOT use this token in local development or test jobs

**Backend Release Tagging:**
- No additional secrets required for backend release tagging
- The DSN can be stored as a secret if not using `.env` in production

### 2. CI Workflow Guidelines

**Important Security Rules:**
- ❌ **NEVER** add Sentry DSN to test jobs or PR checks
- ❌ **NEVER** run symbol upload in PR checks
- ✅ **ONLY** run symbol upload in release workflows
- ✅ **ONLY** run symbol upload if secrets are configured
- ✅ **ALWAYS** verify the environment (staging/production) before upload

### 3. Flutter Release Build with Symbol Upload

**Example GitHub Actions workflow:**

```yaml
name: Build Flutter Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-android:
    runs-on: ubuntu-latest
    if: ${{ secrets.SENTRY_ORG_AUTH_TOKEN != '' }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.44.8'

      - name: Install dependencies
        run: flutter pub get

      - name: Build release APK with symbol upload
        env:
          SENTRY_ORG_AUTH_TOKEN: ${{ secrets.SENTRY_ORG_AUTH_TOKEN }}
          SENTRY_DSN: ${{ secrets.SENTRY_FLUTTER_DSN }}
        run: |
          flutter build apk \
            --obfuscate \
            --split-debug-info=./debug-info \
            --dart-define=ENVIRONMENT=production \
            --dart-define=SENTRY_DSN="$SENTRY_DSN" \
            --dart-define=APP_RELEASE="aera-mobile@${{ github.ref_name }}"

      - name: Upload debug symbols to Sentry
        env:
          SENTRY_ORG_AUTH_TOKEN: ${{ secrets.SENTRY_ORG_AUTH_TOKEN }}
        run: |
          dart run sentry_dart_plugin upload-debug-symbols \
            --org student-cj9 \
            --project aera \
            --auth-token "$SENTRY_ORG_AUTH_TOKEN" \
            --debug-info-path ./debug-info

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: release-apk
          path: build/app/outputs/flutter-apk/app-release.apk
```

**Example GitLab CI configuration:**

```yaml
build-android-release:
  stage: build
  image: cirrusci/flutter:3.44.8
  only:
    - tags
    - /^v\d+\.\d+\.\d+$/
  script:
    - flutter pub get
    - flutter build apk \
        --obfuscate \
        --split-debug-info=./debug-info \
        --dart-define=ENVIRONMENT=production \
        --dart-define=SENTRY_DSN="$SENTRY_FLUTTER_DSN" \
        --dart-define=APP_RELEASE="aera-mobile@$CI_COMMIT_TAG"
    - dart run sentry_dart_plugin upload-debug-symbols \
        --org student-cj9 \
        --project aera \
        --auth-token "$SENTRY_ORG_AUTH_TOKEN" \
        --debug-info-path ./debug-info
  artifacts:
    paths:
      - build/app/outputs/flutter-apk/app-release.apk
    expire_in: 1 week
  rules:
    - if: '$SENTRY_ORG_AUTH_TOKEN'
      when: on_success
    - when: never
```

### 4. Backend Release Tagging

**Example GitHub Actions workflow:**

```yaml
name: Deploy Backend

on:
  push:
    branches:
      - main
      - staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get commit SHA
        id: sha
        run: echo "sha=$(git rev-parse HEAD)" >> $GITHUB_OUTPUT

      - name: Deploy to production
        env:
          SENTRY_DSN: ${{ secrets.SENTRY_BACKEND_DSN }}
          SENTRY_ENVIRONMENT: production
          SENTRY_RELEASE: aera-api@${{ steps.sha.outputs.sha }}
        run: |
          # Your deployment commands here
          # Set SENTRY_RELEASE environment variable for the deployed service
```

**Environment variable injection example:**

```bash
# In deployment script
export SENTRY_RELEASE="aera-api@$(git rev-parse HEAD)"
export SENTRY_ENVIRONMENT="production"
export SENTRY_DSN="${SENTRY_BACKEND_DSN}"

# Start service with Sentry release
pnpm start
```

### 5. Test Job Configuration

**Important:** Test jobs must NOT include Sentry DSN or symbol upload.

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Install dependencies
      run: pnpm install

    - name: Run tests
      run: pnpm test
      # No Sentry DSN environment variables here
      # Tests should pass without Sentry
```

### 6. Sentry UI Configuration (Manual)

After CI/CD is configured, complete these manual steps in the Sentry UI:

**Alerts:**
1. Go to Sentry project > Settings > Alerts
2. Create alert for new production issues
3. Create alert for issue regressions
4. Configure notifications to developer email
5. Apply to `production` and `staging` environments only

**Release Tracking:**
1. Go to Sentry project > Settings > Releases
2. Verify releases are being created by CI/CD
3. Check that commit SHA is properly attached
4. Verify deployment environment is set correctly

### 7. Verification Steps

After configuring CI/CD:

1. **Verify release creation:**
   - Trigger a release build
   - Check Sentry project > Releases
   - Confirm release with correct commit SHA appears

2. **Verify symbol upload:**
   - Check Flutter app build completes successfully
   - Check Sentry project > Settings > Source Maps
   - Confirm debug symbols are uploaded

3. **Verify alerts:**
   - Trigger a test error in production
   - Confirm alert notification is received
   - Check alert configuration in Sentry UI

4. **Verify no secrets in PRs:**
   - Review CI workflow files
   - Ensure no DSN or auth tokens in PR checks
   - Ensure symbol upload only runs on release tags

### 8. Platform-Specific Notes

**Backend:**
- Source maps are not currently uploaded (runs via `tsx`)
- If switching to `tsc` compilation, add source map upload
- Release tagging via `SENTRY_RELEASE` environment variable

**Flutter:**
- Symbol upload requires `SENTRY_ORG_AUTH_TOKEN` secret
- Only upload for release builds with `--obfuscate`
- Use `--split-debug-info` to separate debug symbols
- Upload symbols only in release workflows, never in PRs

**iOS Note:**
- iOS symbol upload requires `.dSYM` files
- This can only be verified on macOS or using Mac CI runners
- Windows environments cannot build/test iOS releases

### 9. Troubleshooting

**Symbol upload fails:**
- Verify `SENTRY_ORG_AUTH_TOKEN` has correct scopes
- Check Sentry project ID and organization name
- Ensure `--split-debug-info` path is correct
- Verify Flutter build completed successfully

**Release not appearing in Sentry:**
- Check `SENTRY_RELEASE` environment variable is set
- Verify commit SHA format is correct
- Check Sentry SDK initialization in application logs
- Ensure environment name matches Sentry environment

**Alerts not firing:**
- Verify alert configuration in Sentry UI
- Check notification email settings
- Ensure alerts are enabled for correct environment
- Test with a real error in production

## Security Checklist

- [ ] Sentry DSN stored as CI secret (not in repository)
- [ ] `SENTRY_ORG_AUTH_TOKEN` stored as CI secret (not in repository)
- [ ] Symbol upload only runs in release workflows
- [ ] Symbol upload skipped if secrets not configured
- [ ] Test jobs do not include Sentry configuration
- [ ] PR checks do not run symbol upload
- [ ] No secrets in workflow YAML files
- [ ] Secrets have minimal required scopes
- [ ] Secrets are rotated regularly
- [ ] Access to secrets is audited
