# Phase F3 — Storage and Provider Configuration Requirements

## Overview

The Aera backend integrates with multiple external providers for storage, notifications, and AI capabilities. All integrations follow a consistent pattern: optional configuration with graceful degradation for local development.

## Required Configuration

### Core Database (Always Required)

These environment variables are required for the backend to function in any environment:

```bash
# Database connection (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"

# Supabase service for storage operations
SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JOB_PHOTOS_BUCKET="job-photos"
```

**Why required**: Database access is essential for all API operations. Supabase storage is required for the photo upload workflow.

## Optional Configuration (Graceful Degradation)

### Email Notifications (Resend)

**Purpose**: Send transactional emails for quotes, invoices, job notifications

**Required for**: Production, staging, demo environments where email notifications are needed

**Environment variables**:
```bash
RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="Aera <onboarding@resend.dev>"
```

**Behavior when missing**: 
- Logs one-time warning: "RESEND_API_KEY is not configured; skipping email send"
- Email sends are silently skipped
- Application continues to function normally

**Provider**: Resend (https://resend.com)
- Free tier: 3,000 emails/month, 100/day
- No credit card required
- Production-ready delivery

### Push Notifications (Firebase Cloud Messaging)

**Purpose**: Send push notifications to mobile devices for job updates, assignments

**Required for**: Production environments with mobile app deployment

**Environment variables**:
```bash
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Behavior when missing**:
- Logs one-time warning: "Firebase push credentials are not configured; skipping push send"
- Push notifications are silently skipped
- Application continues to function normally

**Provider**: Firebase Cloud Messaging (HTTP v1 API)
- Completely free, no quota limits
- Requires Firebase service account JSON key
- Credentials obtained from Firebase Console > Project settings > Service accounts

### SMS Notifications (Textbee)

**Purpose**: Send SMS notifications for urgent job updates, reminders

**Required for**: Production environments requiring SMS delivery

**Environment variables**:
```bash
TEXTBEE_API_KEY="your-textbee-api-key"
```

**Behavior when missing**:
- Logs one-time warning: "TEXTBEE_API_KEY is not configured; skipping SMS send"
- SMS sends are silently skipped
- Application continues to function normally

**Provider**: Textbee.dev (Android SMS gateway)
- Free tier: 300 messages/month, 50/day
- No credit card required
- Requires Android device with Textbee app to be online
- No country restrictions

### AI Job Assistant (Google Gemini)

**Purpose**: Provide AI-powered job insights, risk analysis, and operational intelligence

**Required for**: Production environments with AI features enabled

**Environment variables**:
```bash
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.1-flash-lite"
AI_MAX_TOOL_ITERATIONS=4
```

**Behavior when missing**:
- Logs one-time warning: "GEMINI_API_KEY is not configured; skipping AI reply"
- AI assistant returns null responses
- User messages are still saved to database
- Application continues to function normally

**Provider**: Google Gemini (https://aistudio.google.com/apikey)
- Free tier via Google AI Studio
- No credit card required
- Stable model: gemini-3.1-flash-lite (free-tier eligible)

## Environment-Specific Requirements

### Local Development

**Required**: Core database configuration only
**Optional**: All provider integrations (intentionally disabled for development)

**Rationale**: Developers can run the full application without configuring external services. Missing keys result in graceful degradation with clear log warnings.

### Staging

**Required**: Core database configuration
**Recommended**: Email, push notifications for testing
**Optional**: SMS, AI features

**Rationale**: Staging should mirror production for notification workflows but may not need SMS or AI features during initial testing.

### Production

**Required**: Core database configuration
**Required**: Email notifications (for customer-facing communications)
**Required**: Push notifications (for mobile app functionality)
**Optional**: SMS, AI features (depending on business requirements)

**Rationale**: Production requires all customer-facing notification channels to be functional.

### Demo Environment

**Required**: Core database configuration
**Optional**: Any provider integrations based on demo scope

**Rationale**: Demo environments may use mock data and don't require real notification delivery.

## Security Considerations

### Service Role Key Security

The `SUPABASE_SERVICE_ROLE_KEY` provides full database access and must be:
- Never committed to version control
- Stored securely in environment variables
- Rotated regularly
- Limited to backend server access only
- Never exposed to client applications

### API Key Management

All API keys (Resend, Firebase, Textbee, Gemini) should:
- Be stored in environment variables, not code
- Have appropriate scopes/permissions
- Be rotated if compromised
- Use different keys for different environments when possible

### Signed URL Security

Photo uploads use Supabase signed URLs with:
- 2-hour expiration time
- Tenant-scoped object keys (`companies/{companyId}/jobs/{jobId}/...`)
- MIME type validation
- No direct database access from client

## Monitoring and Observability

### Health Status

The backend should provide endpoint status for optional integrations:
- Database: Critical (must be healthy)
- Storage: Critical (must be healthy)
- Email: Optional (log if unavailable)
- Push: Optional (log if unavailable)
- SMS: Optional (log if unavailable)
- AI: Optional (log if unavailable)

### Error Handling

All providers implement consistent error handling:
- Network errors are logged with truncated response bodies
- API keys are never logged
- Missing configuration results in one-time warnings
- Provider failures don't crash the application
- Graceful degradation maintains core functionality

## Configuration Validation

The backend validates required configuration at startup:
- Database URLs must be valid
- JWT_SECRET must be at least 32 characters
- Service role key must be present
- Invalid configuration prevents server startup

Optional provider keys are:
- Validated at runtime when used
- Allowed to be empty/undefined
- Logged as warnings when missing
- Don't prevent server startup

## Migration Path

### Adding New Providers

When adding new external integrations:
1. Follow the existing adapter pattern
2. Make configuration optional with graceful degradation
3. Log one-time warning when configuration is missing
4. Never commit API keys to version control
5. Document environment requirements
6. Update this configuration document

### Provider Rotation

When rotating provider credentials:
1. Update environment variables
2. Restart backend services
3. Monitor for integration errors
4. Verify new credentials work in staging first
5. Document rotation in deployment logs

## Conclusion

The Aera backend follows a defense-in-depth approach to provider configuration:
- Core database/storage is required and validated
- Optional integrations gracefully degrade when missing
- Security best practices are enforced for all credentials
- Clear documentation for environment-specific requirements
- Consistent error handling and logging across all providers

This architecture enables local development without external dependencies while ensuring production environments have all required integrations properly configured.
