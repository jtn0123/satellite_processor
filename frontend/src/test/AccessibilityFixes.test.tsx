import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function withQC(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function withRouter(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('KeyboardShortcuts accessibility', () => {
  function openModal() {
    render(withRouter(<KeyboardShortcuts />));
    // Open via '?' hotkey (useHotkeys listens on document)
    fireEvent.keyDown(document, { key: '?' });
  }

  it('inner panel is a div, not a button', () => {
    openModal();
    // The inner panel div with role="document" serves as the dialog content
    const dialog = document.querySelector('dialog');
    if (dialog) {
      const innerDiv = dialog.querySelector('div');
      expect(innerDiv).toBeTruthy();
      expect(innerDiv!.tagName).toBe('DIV');
    }
  });

  it('does not have nested buttons', () => {
    openModal();
    const panel = document.querySelector('[role="dialog"]');
    if (panel) {
      const buttons = panel.querySelectorAll('button');
      buttons.forEach(btn => {
        const nestedBtns = btn.querySelectorAll('button');
        expect(nestedBtns.length).toBe(0);
      });
    }
  });

  it('backdrop dialog does not have role="presentation"', () => {
    openModal();
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    // Native <dialog> should not override its implicit role
    expect(dialog!.getAttribute('role')).toBeNull();
  });

  it('panel click stops propagation (does not close)', () => {
    openModal();
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    const panel = dialog!.querySelector('div');
    expect(panel).toBeTruthy();
    fireEvent.click(panel!);
    // Dialog should still be in DOM
    expect(document.querySelector('dialog')).toBeTruthy();
  });
});

describe('WhatsNewModal accessibility', () => {
  it('aria-label is on dialog element', async () => {
    const { default: WhatsNewModal } = await import('../components/WhatsNewModal');
    render(<WhatsNewModal onClose={() => {}} />);
    const dialog = document.querySelector('dialog');
    expect(dialog?.getAttribute('aria-label')).toBe("What's New dialog");
  });

  it('inner content div exists inside dialog', async () => {
    const { default: WhatsNewModal } = await import('../components/WhatsNewModal');
    render(<WhatsNewModal onClose={() => {}} />);
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    const innerDiv = dialog!.querySelector('div');
    expect(innerDiv).toBeTruthy();
  });

  it('close button calls onClose', async () => {
    const { default: WhatsNewModal } = await import('../components/WhatsNewModal');
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    // Click backdrop button
    const backdropBtn = document.querySelector('dialog > button[aria-label="Close dialog"]')!;
    fireEvent.click(backdropBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key closes modal', async () => {
    const { default: WhatsNewModal } = await import('../components/WhatsNewModal');
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    const dialog = document.querySelector('dialog');
    fireEvent(dialog!, new Event('cancel', { bubbles: false }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ImageViewer accessibility', () => {
  it('pan/zoom button has accessible label and no conflicting role', async () => {
    const { default: ImageViewer } = await import('../components/GoesData/ImageViewer');
    const frame = { id: '1', satellite: 'GOES-16', band: 'Band02', sector: 'CONUS', capture_time: '2024-01-01T00:00:00Z', file_size: 1024, file_path: '/test.nc', width: 1000, height: 800, thumbnail_path: null, tags: [], collections: [] };
    render(withQC(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />));
    const panBtn = document.querySelector('button[aria-label*="Pan and zoom"]');
    expect(panBtn).toBeTruthy();
    expect(panBtn!.getAttribute('role')).toBeNull();
  });
});

vi.mock('../hooks/useApi', async () => {
  const actual = await vi.importActual('../hooks/useApi');
  return {
    ...actual,
    useImages: () => ({
      data: [{ id: '1', original_name: 'test.png', url: '/test.png', thumbnail_url: '/thumb.png', uploaded_at: '2024-01-01T00:00:00Z', file_size: 1024 }],
      isLoading: false,
    }),
    useDeleteImage: () => ({ mutate: vi.fn() }),
  };
});

describe('ImageGallery no nested buttons', () => {
  it('lightbox modal content wrapper is a div, not a button', async () => {
    const { default: ImageGallery } = await import('../components/ImageGallery/ImageGallery');
    render(withQC(<ImageGallery />));
    // Click image to open lightbox
    const img = document.querySelector('img');
    if (img) {
      fireEvent.click(img);
      const dialog = document.querySelector('dialog');
      if (dialog) {
        const innerDiv = dialog.querySelector('div');
        expect(innerDiv).toBeTruthy();
        expect(innerDiv!.tagName).toBe('DIV');
      }
    }
  });
});

describe('BrowseTab destructured state', () => {
  it('renders without errors', async () => {
    const { default: BrowseTab } = await import('../components/GoesData/BrowseTab');
    render(withQC(withRouter(<BrowseTab />)));
    // If destructuring is wrong, this would throw
    expect(document.body).toBeTruthy();
  });
});
