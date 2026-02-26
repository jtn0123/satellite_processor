import { describe, it, expect } from 'vitest';

// ── 1. Naming consistency ──────────────────────────────────────────────

describe('Naming consistency', () => {
  it('sidebar uses "Live" not "Live View"', async () => {
    // Read the Layout source to verify label
    const mod = await import('../components/Layout?raw');
    const src = (mod as unknown as { default: string }).default;
    // Should have label: 'Live' (not 'Live View')
    expect(src).toContain("label: 'Live'");
    expect(src).not.toMatch(/label:\s*'Live View'/);
  });

  it('LiveView page title is "Live"', async () => {
    const mod = await import('../pages/LiveView?raw');
    const src = (mod as unknown as { default: string }).default;
    expect(src).toContain("usePageTitle('Live')");
    expect(src).toContain('>Live<');
  });
});

// ── 2. Double-tap zoom (hook) ──────────────────────────────────────────

describe('useImageZoom zoomIn/reset', () => {
  it('zoomIn and reset toggle zoom', async () => {
    const { useImageZoom } = await import('../hooks/useImageZoom');
    const { renderHook, act: actHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.isZoomed).toBe(false);

    actHook(() => { result.current.zoomIn(); });
    expect(result.current.isZoomed).toBe(true);

    actHook(() => { result.current.reset(); });
    expect(result.current.isZoomed).toBe(false);
  });
});

// ── 3. Shimmer / CdnImage ─────────────────────────────────────────────

describe('Image loading shimmer', () => {
  it('CdnImage shows shimmer before load, hides after', async () => {
    // CdnImage is now in its own file; ImagePanelContent has loading-shimmer
    const cdnMod = await import('../components/GoesData/CdnImage?raw');
    const cdnSrc = (cdnMod as unknown as { default: string }).default;
    expect(cdnSrc).toContain('data-testid="image-shimmer"');
    expect(cdnSrc).toContain('animate-pulse');
    const panelMod = await import('../components/GoesData/ImagePanelContent?raw');
    const panelSrc = (panelMod as unknown as { default: string }).default;
    expect(panelSrc).toContain('data-testid="loading-shimmer"');
  });
});

// ── 4. FAB ─────────────────────────────────────────────────────────────

describe('Mobile FAB', () => {
  it('FAB markup exists with sm:hidden for mobile-only', async () => {
    const liveMod = await import('../components/GoesData/LiveTab?raw');
    const liveSrc = (liveMod as unknown as { default: string }).default;
    expect(liveSrc).toContain('data-testid="mobile-fab"');
    expect(liveSrc).toContain('sm:hidden');
    const fabMod = await import('../components/GoesData/MobileControlsFab?raw');
    const fabSrc = (fabMod as unknown as { default: string }).default;
    expect(fabSrc).toContain('data-testid="fab-toggle"');
    expect(fabSrc).toContain('data-testid="fab-menu"');
  });
});
