/**
 * JTN-417: Shared Tailwind class variants.
 *
 * Consolidates the ~10 repeated conditional className pyramids that had
 * accreted in the step indicators, band selectors, and filter pills. Each
 * helper is a plain function returning a pre-joined className string — no
 * runtime cost beyond a property lookup and no runtime dependency.
 *
 * Guideline: add a helper here only when 3+ call sites duplicate the same
 * conditional set, or when the variant set is cohesive enough that a name
 * (e.g. `stepStateClasses`) makes the call site easier to read. Otherwise
 * inline the ternary — over-abstraction hurts discoverability.
 */

/** Three-state wizard step indicator (FetchTab-style). */
export type StepState = 'active' | 'done' | 'pending';

const STEP_STATE_CLASSES: Record<StepState, string> = {
  active: 'bg-primary/20 text-primary border border-primary/30',
  done: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  pending:
    'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700',
};

export function stepStateClasses(state: StepState): string {
  return STEP_STATE_CLASSES[state];
}

/**
 * Two-state step button used by the ProcessingForm wizard (no "done"
 * checkmark state). Kept separate from stepStateClasses so call sites stay
 * explicit about whether they model completion.
 */
export function stepButtonClasses(active: boolean): string {
  return active
    ? 'bg-primary/10 text-primary'
    : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white';
}

/**
 * Selection ring used on picker cards: BandPicker band tiles,
 * SatelliteStep satellite cards, etc. The outer `transition-all` and
 * `cursor-pointer` live on the caller so this helper owns only the
 * state-specific bits.
 */
export function selectableCardClasses(selected: boolean): string {
  return selected
    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-primary/30';
}

/**
 * Quick-filter pill used in BandPicker and elsewhere: lightly rounded,
 * primary tint when active, neutral fill when inactive.
 */
export function filterPillClasses(active: boolean): string {
  return active
    ? 'bg-primary/20 border-primary/50 text-primary'
    : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-primary/30';
}

/**
 * Segmented-control style button used by the WhatStep image type picker
 * and similar inline toggle rows.
 */
export function segmentedButtonClasses(active: boolean): string {
  return active
    ? 'bg-primary/10 border-primary/30 text-primary'
    : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-primary/30';
}
