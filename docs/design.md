# Aera — Design System, Screen Map & Stitch Workflow

> This is the single source of truth for visual design, interaction language, screen inventory, user journeys, Stitch generation, and design handoff.

---
version: alpha
name: Aera
description: Premium visual system for Aera, a field-service operations SaaS for HVAC businesses. Calm competence, quiet luxury, strong operational clarity, and fast mobile interaction.
colors:
  ink: "#151917"
  ink-soft: "#343B37"
  canvas: "#F6F5F1"
  surface: "#FFFFFF"
  surface-subtle: "#EEF0EC"
  line: "#DCE0DB"
  accent: "#1E5A58"
  accent-soft: "#E0EEEB"
  accent-deep: "#12403F"
  success: "#2F7D5A"
  success-soft: "#E5F2EA"
  warning: "#9A6A22"
  warning-soft: "#F8EEDB"
  danger: "#A84A46"
  danger-soft: "#F7E8E7"
  info: "#4D6882"
  info-soft: "#E9EFF5"
  scrim: "#151917"
typography:
  display:
    fontFamily: "Inter"
    fontSize: 36px
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: -0.03em
  h1:
    fontFamily: "Inter"
    fontSize: 30px
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: -0.025em
  h2:
    fontFamily: "Inter"
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.02em
  h3:
    fontFamily: "Inter"
    fontSize: 18px
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: -0.01em
  body:
    fontFamily: "Inter"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter"
    fontSize: 12px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: 0.01em
  money:
    fontFamily: "Inter"
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: -0.025em
rounded:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 24px
  full: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  7: 28px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
components:
  primary-button:
    background: "{colors.accent}"
    foreground: "{colors.surface}"
    radius: "{rounded.md}"
  secondary-button:
    background: "{colors.surface-subtle}"
    foreground: "{colors.ink}"
    radius: "{rounded.md}"
  card:
    background: "{colors.surface}"
    border: "{colors.line}"
    radius: "{rounded.lg}"
  input:
    background: "{colors.surface}"
    border: "{colors.line}"
    radius: "{rounded.md}"
---

## Overview

Aera is **quiet luxury for field-service operations**. The visual identity should feel like software that a serious service company pays for every month: calm, precise, trustworthy, and highly considered. It should not look like a generic dashboard template, a fintech clone, or an AI toy.

The interface balances two competing needs: an owner/dispatcher needs dense operational information at a glance, while a technician needs extreme simplicity on a phone while standing beside an HVAC unit. The design therefore uses strong hierarchy rather than decoration. Large numbers, concise status labels, clear primary actions, restrained borders, and generous breathing room create a premium feel without sacrificing information density.

The emotional target is **calm competence**: the user should feel that Aera knows what matters, removes friction, and never gets in the way.

## Colors

The canvas is a warm neutral rather than pure white. This gives the product a premium, physical-material quality and prevents the interface from feeling sterile.

- **Ink** {colors.ink}: primary typography and high-salience UI.
- **Ink Soft** {colors.ink-soft}: secondary text and supporting hierarchy.
- **Canvas** {colors.canvas}: application background and page-level atmosphere.
- **Surface** {colors.surface}: elevated containers and cards.
- **Surface Subtle** {colors.surface-subtle}: quiet controls and secondary surfaces.
- **Line** {colors.line}: hairline borders and separators.
- **Accent** {colors.accent}: primary interactive color, active navigation, main CTAs, selected states.
- **Accent Soft** {colors.accent-soft}: subtle accent backgrounds and selected-row context.
- **Accent Deep** {colors.accent-deep}: pressed/strong accent state.
- **Success** {colors.success}: completed/paid/healthy states.
- **Warning** {colors.warning}: attention states such as overdue or at-risk work.
- **Danger** {colors.danger}: destructive/error states.
- **Info** {colors.info}: informational statuses.

Color should communicate hierarchy and state, not decorate every surface. Never use the full accent palette on every component.

## Typography

Use **Inter** as the primary UI family. Keep typography simple: a small set of weights should do most of the work. Premium character comes from spacing, scale, contrast, and restraint rather than a large collection of typefaces.

Headlines use compact line-height and subtle negative tracking. Body copy is comfortable and readable. Money and KPI values get strong numeric hierarchy. Labels should be concise rather than all-caps everywhere.

Never make an entire dashboard bold. Avoid tiny gray text for important operational information.

## Layout

The product uses a 4px base spacing rhythm. Screens should feel spacious at the page level and efficient inside operational lists.

Use:

- clear top-level page title and context;
- one strong primary action per screen;
- 16–24px content padding on phones;
- 24–32px section separation for major groups;
- compact 12–16px internal spacing for operational rows;
- alignment lines that persist across adjacent cards and sections.

For owner/dispatcher screens, use a calm dashboard grid with a small number of high-signal KPI areas. For technician screens, prioritize a single-column task flow and thumb-friendly controls. For customer screens, remove internal-business clutter and show only what helps the customer complete the current task.

Do not fill empty space merely to make the screen feel “busy.” Intentional negative space is part of the brand.

## Elevation & Depth

Aera is mostly a **border-and-surface** system, not a shadow-heavy system. Use whisper-soft shadows only when a component needs separation from the canvas or when a modal/bottom sheet is elevated.

Avoid floating every card. Use elevation to express interaction hierarchy:

1. Canvas — lowest depth.
2. Surface cards — subtle separation.
3. Sticky controls / bottom sheets — clear but restrained elevation.
4. Modal dialogs — strongest depth plus scrim.

Avoid glassmorphism as the default. Transparency may appear only in a deliberately designed overlay context.

## Shapes

The shape language is soft but controlled. Use medium corner radii for inputs and buttons, larger radii for major cards, and fully rounded shapes only for pills, avatars, and compact status tokens.

Do not wrap every text row in its own rounded rectangle.

## Components

### Buttons

Primary actions use {colors.accent} with high-contrast foreground text. Buttons should look touchable without looking inflated. Use one dominant primary button per action context.

Secondary buttons use quiet surfaces/borders. Destructive actions should use an explicit danger treatment and confirmation when irreversible.

### Cards

Cards are functional grouping devices, not decoration. A card should contain a meaningful unit of information: a job, customer, invoice, quote, KPI cluster, or insight.

### Inputs

Inputs should be calm, roomy, and obviously editable. Labels remain visible; placeholders never substitute for labels. Validation appears close to the relevant field and should not cause the entire form to jump.

### Status pills

Status tokens are concise and semantic. Use color plus text/icon; never communicate status through color alone.

### Job rows

Job rows should make the essential decision obvious: time, customer, service issue, technician, and current state. Avoid visual noise such as unnecessary avatars or icons on every line.

### Technician controls

Use a large, unmistakable primary action for Start Job, Add Evidence, Complete Job, etc. These controls should remain usable with one thumb and should not require precise tapping.

### AI surfaces

AI is embedded into the operational language of Aera. AI cards should show the question, the answer, the underlying data references, and an action where possible. Do not use glowing gradients, robot illustrations, or chatbot-style filler to announce AI.

## Motion

Motion should make the interface feel **fast and mechanical, not playful**.

```yaml
motion:
  micro: 120ms
  standard: 180ms
  emphasis: 280ms
  modal: 220ms
  easing: "ease-out"
```

- Interactive feedback: 120–160ms.
- Standard content changes: 180–240ms.
- Larger state changes: 240–300ms.
- Nothing routine should animate longer than ~300ms.
- Respect reduced-motion preferences.
- Animate the smallest changed region possible.
- Never block the completion of a user task for an animation.

Preferred motion:

- KPI values can count once when first loaded.
- A job status pill can morph between states.
- Rescheduled rows can move locally rather than reanimating the whole list.
- Photo upload can show immediate progress.
- Successful quote approval/payment can use one restrained confirmation transition.
- AI results can appear progressively inside a stable content area.

Avoid continuous gradients, particle effects, parallax, large springy bounces, or repeated full-page fades.

## Do's and Don'ts

### Do

- Use warm neutrals and one refined accent.
- Keep the hierarchy obvious within one second.
- Make the product feel operationally serious.
- Use realistic HVAC data in designs.
- Design loading, empty, error, offline, and permission states.
- Prefer local, purposeful motion.
- Keep dense lists highly scannable.
- Preserve generous page-level breathing room.

### Don't

- Don't turn every section into a rounded card.
- Don't use neon gradients to signify AI.
- Don't use excessive glassmorphism.
- Don't use five accent colors for ordinary hierarchy.
- Don't make routine transitions slow.
- Don't hide critical business actions behind decorative interaction.
- Don't sacrifice readability for aesthetic minimalism.

## Stitch generation notes

When generating Aera in Stitch, describe the product as **premium field-service operations software with quiet-luxury editorial discipline**, not as a generic “modern SaaS dashboard.” Stitch should preserve the intent of this document across every screen.

Example prompts:

1. **Dashboard:** “Create a premium HVAC operations dashboard with calm off-white canvas, charcoal typography, deep teal primary accent, strong revenue and workload hierarchy, compact job schedule, subtle status chips, and one clear urgent-exception panel. It should feel expensive and calm rather than dense or flashy.”
2. **Technician:** “Create a thumb-friendly technician job screen using Aera's quiet-luxury operations language. Prioritize service address, customer issue, next action, and job state. Use one dominant CTA and keep supporting metadata visually quiet.”
3. **AI:** “Create an AI operations insight surface that reads like a senior operations analyst inside the product: concise question, data-backed answer, evidence references, confidence/limitations, and a direct action. No chatbot neon, robot art, or decorative AI effects.”

## Iteration guidance

When a generated screen feels wrong, change the **intent description first**, not the token values. Preserve the system's colors, typography, spacing rhythm, and shape language unless a deliberate design-system revision has been approved.

---


## Product design target

Initial design target: **40 screen/states**.

The number is deliberate: enough coverage to feel like a real commercial product, but constrained enough that the project can actually be completed and polished.

States such as loading, empty, error, offline, and permission-denied should normally be designed as variants of the relevant screen rather than counted as separate full screens unless the interaction meaningfully changes.

## Screen inventory

### A. Authentication — 6

1. Splash
2. Welcome / Intro
3. Login
4. Sign Up
5. Forgot Password
6. Reset Password

### B. Business-owner onboarding — 5

7. Business Basics
8. Service Area
9. Services
10. Team Setup
11. Onboarding Complete

### C. Owner / Dispatcher operations — 9

12. Dashboard
13. Jobs
14. Job Detail
15. Calendar
16. Customers
17. Customer Detail
18. Quotes
19. Quote Detail
20. Invoices

### D. Creation / scheduling flows — 5

21. Create Customer
22. Create Job
23. Schedule Job
24. Create Quote
25. Create Invoice

### E. Technician experience — 6

26. Technician Home
27. Job Brief
28. En Route / Navigation Context
29. Work In Progress
30. Job Evidence
31. Complete Job

### F. Customer experience — 4

32. Customer Home
33. Technician Tracking
34. Quote Approval
35. Invoice / Payment

### G. AI + account — 5

36. AI Operations Assistant
37. AI Insight Detail
38. Notifications
39. Profile / Settings
40. Company Settings

## Required primary journeys

### Owner onboarding

`Splash → Welcome → Sign Up → Business Basics → Service Area → Services → Team Setup → Onboarding Complete → Dashboard`

### Authentication return path

`Splash → Login → Dashboard`

### Owner creates a complete job

`Dashboard → Create Customer → Create Job → Schedule Job → Job Detail → Create Quote → Quote Detail`

### Customer approves and pays

`Quote Approval → Invoice / Payment`

### Technician executes the work

`Technician Home → Job Brief → En Route → Work In Progress → Job Evidence → Complete Job`

### AI operational moment

`Dashboard → AI Operations Assistant → AI Insight Detail → affected Job Detail`

## Stitch batching

Do not generate all 40 screens in one prompt.

### Batch 1 — Brand + auth

Splash, Welcome, Login, Sign Up, Forgot Password, Reset Password.

### Batch 2 — Owner onboarding

Business Basics, Service Area, Services, Team Setup, Onboarding Complete.

### Batch 3 — Core operations

Dashboard, Jobs, Job Detail, Calendar, Customers, Customer Detail.

### Batch 4 — Commercial workflow

Quotes, Quote Detail, Invoices, Create Customer, Create Job, Schedule Job, Create Quote, Create Invoice.

### Batch 5 — Technician

Technician Home, Job Brief, En Route, Work In Progress, Job Evidence, Complete Job.

### Batch 6 — Customer + AI + account

Customer Home, Technician Tracking, Quote Approval, Invoice/Payment, AI Assistant, AI Insight, Notifications, Profile, Company Settings.

## Stitch generation rules

1. Start every Stitch batch by applying the project's design system (`DESIGN.md`).
2. Reuse the same visual language across the batch; do not re-invent colors, typography, corner radii, or card styles per screen.
3. Generate realistic HVAC data. Avoid lorem ipsum and placeholder-heavy screens.
4. Show operational density without visual clutter.
5. Every primary screen must have a clear dominant action.
6. Show believable loading/empty/error states as component variants.
7. Keep animations subtle and purposeful; never add decorative motion simply because the generator can.
8. Validate touch targets and responsive behavior after generation.
9. Connect the actual journeys in the Stitch prototype before exporting.
10. Do a final cross-screen consistency review before handing the export to an AI coding agent.

## Stitch → AI handoff contract

When exporting the Stitch work, provide the coding agent:

- the Stitch ZIP/export;
- `DESIGN.md` / `.stitch/DESIGN.md`;
- this repository's `01–13` engineering/product documents;
- any approved logos, icons, images, or font decisions.

Tell the agent explicitly:

> The Stitch output is the visual source of truth. Recreate the approved screens in Flutter; do not replace them with a new visual concept. Preserve layout hierarchy, spacing rhythm, typography, component variants, states, and motion intent. Use the engineering documents as the source of truth for behavior, backend integration, security, and data flow.

---


These prompts are designed to be used one coherent batch at a time. Apply `.stitch/DESIGN.md` before generating each batch.

## Global instruction to prepend to every batch

> Design high-fidelity mobile-first product screens for **Aera**, a premium field-service operations SaaS built first for HVAC companies. Follow the attached Aera DESIGN.md exactly for visual identity. The experience should feel calm, expensive, fast, operationally clear, and trustworthy. Avoid generic SaaS templates, excessive glassmorphism, neon AI aesthetics, oversized rounded cards, unnecessary gradients, and decorative motion. Use realistic HVAC data, believable customer names, job descriptions, schedules, quotes, invoice values, technician statuses, and timestamps. Maintain a single coherent design system across all screens in this batch and across prior approved screens.

## Batch 1 — Authentication

Create these six screens:

1. Splash — elegant Aera wordmark, quiet branded motion, premium warm-light atmosphere.
2. Welcome — concise product proposition with a clear Owner/Business entry path.
3. Login — email/password, password visibility, remember-device option, forgot password, primary CTA, subtle trust cue.
4. Sign Up — separate from Login; name, email, password, company name, consent; clear progression.
5. Forgot Password — minimal recovery flow.
6. Reset Password — new password + confirmation + success transition.

The Login and Sign Up screens must be visually distinct and not merely two tabs in one giant form.

## Batch 2 — Onboarding

Create:

7. Business Basics
8. Service Area
9. Services
10. Team Setup
11. Onboarding Complete

Onboarding should feel progressive, lightweight, and motivating. Use a clear progress indicator. Avoid multi-page enterprise forms.

## Batch 3 — Operations

Create:

12. Dashboard
13. Jobs
14. Job Detail
15. Calendar
16. Customers
17. Customer Detail

Dashboard should immediately communicate today's jobs, revenue, unpaid/overdue amounts, exceptions, and the next operational action.

## Batch 4 — Commercial workflow

Create:

18. Quotes
19. Quote Detail
20. Invoices
21. Create Customer
22. Create Job
23. Schedule Job
24. Create Quote
25. Create Invoice

Forms should be broken into logical sections with progressive disclosure. Do not create giant dense forms.

## Batch 5 — Technician

Create:

26. Technician Home
27. Job Brief
28. En Route / Navigation Context
29. Work In Progress
30. Job Evidence
31. Complete Job

This flow must be thumb-friendly and optimized for fast use on a job site. Primary actions should be obvious without scrolling where practical.

## Batch 6 — Customer + AI + account

Create:

32. Customer Home
33. Technician Tracking
34. Quote Approval
35. Invoice / Payment
36. AI Operations Assistant
37. AI Insight Detail
38. Notifications
39. Profile / Settings
40. Company Settings

AI screens should feel like an operational command layer, not a chatbot toy. Use real data references such as jobs, technicians, schedules, unpaid invoices, and workload.

## Design ownership

This file owns visual tokens, typography, layout, components, motion, accessibility presentation, screen mapping, Stitch prompts, and design-to-code handoff. Product behavior belongs in `PRD.md`; engineering implementation rules belong in `rules.md`.
