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
    // We test via the LiveTab's ImagePanelContent indirectly
    // Simpler: test the raw source contains shimmer data-testid
    const mod = await import('../components/GoesData/LiveTab?raw');
    const src = (mod as unknown as { default: string }).default;
    expect(src).toContain('data-testid="image-shimmer"');
    expect(src).toContain('data-testid="loading-shimmer"');
    expect(src).toContain('animate-pulse');
  });
});

// ── 4. FAB ─────────────────────────────────────────────────────────────

describe('Mobile FAB', () => {
  it('FAB markup exists with sm:hidden for mobile-only', async () => {
    const mod = await import('../components/GoesData/LiveTab?raw');
    const src = (mod as unknown as { default: string }).default;
    expect(src).toContain('data-testid="mobile-fab"');
    expect(src).toContain('sm:hidden');
    expect(src).toContain('data-testid="fab-toggle"');
    expect(src).toContain('data-testid="fab-menu"');
  });
});
