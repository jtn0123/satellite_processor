import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ImageViewer from '../components/GoesData/ImageViewer';
import WhatsNewModal from '../components/WhatsNewModal';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

vi.mock('../api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const makeFrame = (id: string) => ({
  id, satellite: 'GOES-18', sector: 'CONUS', band: 'Band13',
  capture_time: '2024-01-01T00:00:00Z', file_path: '/test.nc',
  file_size: 1024, thumbnail_path: null, width: 1000, height: 1000,
  tags: [], collections: [],
});

describe('SonarQube final fixes', () => {
  describe('ImageViewer - role="application" and tabIndex', () => {
    it('pan/zoom button has role="application"', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      const panZoom = document.querySelector('[role="application"]');
      expect(panZoom).toBeTruthy();
      expect(panZoom!.tagName).toBe('BUTTON');
    });

    it('dialog does not have tabIndex on non-interactive element', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      const dialog = document.querySelector('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog?.hasAttribute('tabindex')).toBe(false);
    });

    it('handles mouseMove and mouseUp on dialog without errors', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      const dialog = document.querySelector('dialog')!;
      expect(dialog).toBeTruthy();
      fireEvent.mouseMove(dialog, { clientX: 100, clientY: 100 });
      fireEvent.mouseUp(dialog);
      // Verify dialog and image remain rendered after mouse interactions
      const img = dialog.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.getAttribute('alt')).toContain('GOES-18');
    });
  });

  describe('WhatsNewModal - role="presentation" on backdrop', () => {
    it('dialog has role="presentation" for backdrop overlay', () => {
      render(<WhatsNewModal onClose={() => {}} />);
      const dialog = document.querySelector('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog!.getAttribute('role')).toBe('presentation');
    });

    it('closes when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<WhatsNewModal onClose={onClose} />);
      const dialog = document.querySelector('dialog')!;
      fireEvent.click(dialog);
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape keydown', () => {
      const onClose = vi.fn();
      render(<WhatsNewModal onClose={onClose} />);
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('does not close when panel content is clicked (stopPropagation)', () => {
      const onClose = vi.fn();
      render(<WhatsNewModal onClose={onClose} />);
      // The inner panel div has stopPropagation, find it by class
      const panel = document.querySelector('.modal-panel');
      expect(panel).toBeTruthy();
      fireEvent.click(panel!);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('KeyboardShortcuts - role="presentation" on backdrop', () => {
    it('does not render dialog by default (closed state)', () => {
      render(<KeyboardShortcuts />);
      expect(document.querySelector('dialog')).toBeNull();
    });

    it('renders dialog with role="presentation" when opened via ? key', () => {
      render(<KeyboardShortcuts />);
      // The component listens for '?' key to open
      fireEvent.keyDown(document, { key: '?' });
      const dialog = document.querySelector('dialog');
      expect(dialog).not.toBeNull();
      expect(dialog!.getAttribute('role')).toBe('presentation');
    });
  });
});
