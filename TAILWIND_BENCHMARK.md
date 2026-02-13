# Tailwind CSS Migration Benchmark: v3 → v4

## Before (Tailwind CSS v3.4.19)

| Metric | Value |
|---|---|
| Build time (avg of 3) | 13.62s (13.535s, 13.694s, 13.623s) |
| CSS output size | 51,190 bytes (36,153 + 15,037) |
| Total bundle size | 852K |
| Config lines (tailwind.config.js) | 41 |
| className occurrences in src/ | 1,134 |

## After (Tailwind CSS v4.1.18)

| Metric | Value |
|---|---|
| Build time (avg of 3) | 12.91s (12.927s, 12.950s, 12.865s) |
| CSS output size | 65,960 bytes (50,353 + 15,607) |
| Total bundle size | 868K |
| Config lines (@theme in index.css) | 128 (includes all styles, not just config) |
| className occurrences in src/ | 1,134 |

## Comparison

| Metric | v3 | v4 | Change |
|---|---|---|---|
| Build time (avg) | 13.62s | 12.91s | **-5.2% faster** |
| CSS output | 51,190 B | 65,960 B | +28.9% (v4 includes more resets/compat styles) |
| Total bundle | 852K | 868K | +1.9% |
| Config | 41-line JS file | CSS-first @theme block | Simpler, colocated |

## v4 Optimized (Compat Layer Removed)

| Metric | Value |
|---|---|
| Build time (avg of 3) | ~12.9s |
| CSS output size | 65,741 bytes (50,134 + 15,607) |
| Total bundle size | ~868K |

### Changes
- Removed v3→v4 border-color compatibility layer (`@layer base` reset) — all components already specify explicit border colors
- Reverted 49 unnecessary `rounded-sm` → `rounded` (both are 0.25rem in v4; migration tool was overly defensive)
- PostCSS config verified: only `@tailwindcss/postcss` (no autoprefixer)
- All 120 tests pass, ESLint clean (zero warnings)
- CSS output reduced by 219 bytes (65,960 → 65,741); remaining delta vs v3 is v4's larger preflight/reset

### Notes
- CSS output is larger in v4 due to compatibility layer (border-color reset) and v4's different output strategy
- Build time improved slightly (~0.7s faster)
- Total bundle size difference is negligible (+16K)
- All 120 tests pass, ESLint clean, zero warnings
- `tailwind.config.js` eliminated — config now lives in CSS via `@theme`
- `darkMode: 'class'` migrated to `@custom-variant dark (&:is(.dark *))`
- `autoprefixer` removed (built into v4), replaced with `@tailwindcss/postcss`
