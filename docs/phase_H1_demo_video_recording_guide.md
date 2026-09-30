# Phase H1 — Demo Video Recording Guide

## Overview

This document provides instructions for recording the Aera demo video as required by Phase H1 (Phase 12 hardening). This is a manual task that requires human recording and cannot be automated.

## Demo Video Requirements

### Video Specifications
- **Duration:** 2-3 minutes
- **Format:** MP4 (recommended) or web-compatible format
- **Resolution:** 1080p (1920x1080) or higher
- **Audio:** Clear voiceover explaining the workflow
- **Quality:** Clean production build (no debug overlays)

### Content Requirements

The demo should showcase the **happy-path workflow** from start to finish:

1. **Dashboard Overview** (10-15 seconds)
   - Show the main dashboard with job and schedule overview
   - Highlight key metrics and navigation

2. **Customer Management** (15-20 seconds)
   - Navigate to Customers screen
   - Show customer list and details
   - Demonstrate adding a service address

3. **Job Creation** (20-25 seconds)
   - Create a new job
   - Select customer and service address
   - Assign job details and notes

4. **Quote Creation** (15-20 seconds)
   - Create a quote for the job
   - Add line items
   - Show quote totals

5. **Job Scheduling** (15-20 seconds)
   - Schedule the job
   - Assign a technician
   - Show calendar view

6. **Technician Execution** (20-25 seconds)
   - Show technician view (Job Brief)
   - Demonstrate adding notes and photos
   - Complete the job

7. **Invoicing** (15-20 seconds)
   - Create invoice from completed job
   - Show invoice details
   - Demonstrate payment recording

8. **Dashboard Conclusion** (10-15 seconds)
   - Return to dashboard
   - Show updated status
   - End with Aera branding

## Recording Tools

### Recommended Tools

**Screen Recording:**
- **Windows:** OBS Studio, Microsoft Game Bar (Win+G), Camtasia
- **Mac:** QuickTime Player, OBS Studio, ScreenFlow
- **Linux:** OBS Studio, SimpleScreenRecorder

**Voiceover:**
- Built-in microphone or external USB microphone
- Audacity for audio editing (if needed)
- Ensure clear, quiet recording environment

**Video Editing:**
- DaVinci Resolve (free)
- iMovie (Mac)
- Windows Video Editor
- CapCut (free)

## Pre-Recording Checklist

### 1. Prepare Demo Data
```powershell
# Seed demo data if not already done
pnpm --filter backend seed:demo
```

### 2. Start Backend
```powershell
pnpm --filter backend dev
```

### 3. Build Flutter Release
```powershell
# Build release APK for Android
flutter build apk --release

# Or build release for iOS (Mac only)
flutter build ios --release
```

### 4. Install and Launch App
- Install the release build on a device or emulator
- Launch the app
- Login with demo credentials:
  - Email: admin@aera.demo
  - Password: Demo123!

### 5. Clear Any Cached Data
- Ensure clean state before recording
- Close and reopen the app if needed

## Recording Tips

### Video Quality
- Use 1080p resolution or higher
- Ensure stable frame rate (30fps or 60fps)
- Avoid screen tearing or lag
- Close unnecessary applications to free resources

### Audio Quality
- Use a quiet recording environment
- Speak clearly and at a moderate pace
- Test microphone levels before recording
- Consider using a script or outline

### Workflow
- Practice the workflow 2-3 times before recording
- Use smooth, deliberate gestures
- Pause briefly between actions
- Keep transitions natural

### Branding
- Start with Aera splash screen
- End with Aera logo or branding
- Keep demo clean and professional
- Avoid showing debug information or errors

## Post-Recording

### Video Editing (Optional)
- Trim any mistakes or long pauses
- Add simple transitions if desired
- Ensure audio levels are consistent
- Add intro/outro cards if needed

### Export Settings
- Format: MP4 (H.264 codec)
- Resolution: 1080p (1920x1080)
- Frame rate: 30fps
- Bitrate: 5-10 Mbps (for 1080p)
- Audio: AAC, 128kbps or higher

### File Naming
- Use descriptive name: `aera-demo-v1.0.0.mp4`
- Include version number
- Keep file size reasonable (under 100MB preferred)

## Delivery

### Where to Store
- Upload to project repository (if under 100MB)
- Or upload to video hosting service (YouTube, Vimeo)
- Add link to README.md in "Screenshots and Media" section

### Documentation Update
Update the following files after video is created:

1. **README.md** - Add video link in "Screenshots and Media" section
2. **docs/phase_H1_final_hardening_evidence.md** - Mark demo video as complete
3. **docs/phase_H1_final_release_gate_checklist.md** - Mark demo video as complete

## Troubleshooting

### Common Issues

**Screen recorder won't capture app:**
- Try running as administrator
- Check app permissions
- Use different recording tool

**Audio quality poor:**
- Use external microphone
- Reduce background noise
- Test microphone levels

**App performance slow during recording:**
- Close other applications
- Use lower recording resolution
- Ensure device meets requirements

**Demo data not appearing:**
- Verify demo data seeded correctly
- Check backend is running
- Verify login credentials

## Script Template (Optional)

```
[Intro - 10s]
"Welcome to Aera, the mobile-first field-service operations platform for HVAC businesses."

[Dashboard - 15s]
"Here's the main dashboard showing job and schedule overview with key metrics."

[Customers - 20s]
"Let's navigate to Customers to manage customer information and service addresses."

[Job Creation - 25s]
"Now I'll create a new job, select a customer, and add job details."

[Quote - 20s]
"I'll create a quote with line items and calculate the total."

[Scheduling - 20s]
"Next, I'll schedule the job and assign a technician."

[Technician View - 25s]
"Here's the technician view with job details, notes, and photo upload."

[Completion - 15s]
"After completing the job, I'll create an invoice."

[Conclusion - 10s]
"Aera streamlines the entire customer-to-cash workflow for HVAC businesses."
```

## Conclusion

The demo video is a critical component of Phase H1 hardening. While this task requires manual recording, following this guide will ensure a professional, informative video that showcases Aera's capabilities.

**Estimated Time:** 1-2 hours (including practice and editing)

**Priority:** High for release readiness

**Status:** ⏳ Pending - Requires human recording

## Related Documentation

- **Phase H1 Hardening Evidence:** [docs/phase_H1_final_hardening_evidence.md](docs/phase_H1_final_hardening_evidence.md)
- **Demo Seed Data:** [docs/phase_H1_demo_seed_data.md](docs/phase_H1_demo_seed_data.md)
- **README:** [README.md](README.md)
