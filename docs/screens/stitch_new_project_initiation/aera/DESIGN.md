---
version: alpha
name: Aera
description: Premium visual system for Aera, a field-service operations SaaS for HVAC
  businesses. Calm competence, quiet luxury, strong operational clarity, and fast
  mobile interaction.
colors:
  ink: '#151917'
  ink-soft: '#343B37'
  canvas: '#F6F5F1'
  surface: '#FFFFFF'
  surface-subtle: '#EEF0EC'
  line: '#DCE0DB'
  accent: '#1E5A58'
  accent-soft: '#E0EEEB'
  accent-deep: '#12403F'
  success: '#2F7D5A'
  success-soft: '#E5F2EA'
  warning: '#9A6A22'
  warning-soft: '#F8EEDB'
  danger: '#A84A46'
  danger-soft: '#F7E8E7'
  info: '#4D6882'
  info-soft: '#E9EFF5'
  scrim: '#151917'
  surface-dim: '#d8dbd7'
  surface-bright: '#f7faf6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f1'
  surface-container: '#ecefeb'
  surface-container-high: '#e6e9e5'
  surface-container-highest: '#e0e3e0'
  on-surface: '#181c1a'
  on-surface-variant: '#404848'
  inverse-surface: '#2d312f'
  inverse-on-surface: '#eef2ee'
  outline: '#707978'
  outline-variant: '#bfc8c7'
  surface-tint: '#2d6765'
  primary: '#004240'
  on-primary: '#ffffff'
  primary-container: '#1e5a58'
  on-primary-container: '#96cfcc'
  inverse-primary: '#97d1ce'
  secondary: '#59605b'
  on-secondary: '#ffffff'
  secondary-container: '#dae1db'
  on-secondary-container: '#5d6460'
  tertiary: '#5a2f19'
  on-tertiary: '#ffffff'
  tertiary-container: '#75452e'
  on-tertiary-container: '#f7b598'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b3edea'
  primary-fixed-dim: '#97d1ce'
  on-primary-fixed: '#00201f'
  on-primary-fixed-variant: '#0e4f4d'
  secondary-fixed: '#dde4de'
  secondary-fixed-dim: '#c1c8c3'
  on-secondary-fixed: '#161d1a'
  on-secondary-fixed-variant: '#414844'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#fab79a'
  on-tertiary-fixed: '#341101'
  on-tertiary-fixed-variant: '#693b25'
  background: '#f7faf6'
  on-background: '#181c1a'
  surface-variant: '#e0e3e0'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: -0.03em
  h1:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: -0.025em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.02em
  h3:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: 0.01em
  money:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '650'
    lineHeight: '1.12'
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '650'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '620'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.45'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '650'
    lineHeight: '1.25'
    letterSpacing: 0.01em
rounded:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 24px
  full: 999px
  DEFAULT: 0.5rem
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
  '1': 0.25rem
  '2': 0.5rem
  '3': 0.75rem
  '4': 1rem
  '5': 1.25rem
  '6': 1.5rem
  '7': 1.75rem
  '8': 2rem
  '10': 2.5rem
  '12': 3rem
  '16': 4rem
components:
  primary-button:
    background: '{colors.accent}'
    foreground: '{colors.surface}'
    radius: '{rounded.md}'
  secondary-button:
    background: '{colors.surface-subtle}'
    foreground: '{colors.ink}'
    radius: '{rounded.md}'
  card:
    background: '{colors.surface}'
    border: '{colors.line}'
    radius: '{rounded.lg}'
  input:
    background: '{colors.surface}'
    border: '{colors.line}'
    radius: '{rounded.md}'
---

