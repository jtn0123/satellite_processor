/**
 * JTN-387: Extract compare-mode state from LiveTab.
 *
 * Owns the compareMode toggle and the slider position. Centralizing
 * this lets LiveTab stay under ~250 LOC and gives
 * ControlsOverlay/ImagePanelContent a single source of truth for the
 * comparison UI.
 */
import { useState } from 'react';

interface UseComparisonPanelResult {
  readonly compareMode: boolean;
  readonly setCompareMode: React.Dispatch<React.SetStateAction<boolean>>;
  readonly comparePosition: number;
  readonly setComparePosition: (v: number) => void;
}

export function useComparisonPanel(): UseComparisonPanelResult {
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  return { compareMode, setCompareMode, comparePosition, setComparePosition };
}
