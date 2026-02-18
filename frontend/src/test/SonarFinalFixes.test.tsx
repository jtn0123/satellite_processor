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
  describe('ImageViewer - pan/zoom button accessibility', () => {
    it('pan/zoom button has no conflicting role', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      const panBtn = document.querySelector('button[aria-label*="Pan and zoom"]');
      expect(panBtn).toBeTruthy();
      expect(panBtn!.getAttribute('role')).toBeNull();
    });

    it('dialog does not have tabIndex on non-interactive element', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      const dialog = document.querySelector('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog?.hasAttribute('tabindex')).toBe(false);
    });

    it('handles mouseMove and mouseUp on image area without errors', () => {
      const frame = makeFrame('1');
      render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);
      // Image area is the flex container div holding nav buttons and the image
      const img = document.querySelector('img[alt*="GOES-18"]')!;
      expect(img).toBeTruthy();
      const imageArea = img.closest('.flex-1')!;
      expect(imageArea).toBeTruthy();
      fireEvent.mouseMove(imageArea, { clientX: 100, clientY: 100 });
      fireEvent.mouseUp(imageArea);
      expect(img).toBeTruthy();
    });
  });

  describe('WhatsNewModal - native dialog usage', () => {
    it('dialog has aria-label for accessibility', () => {
      render(<WhatsNewModal onClose={() => {}} />);
      const dialog = document.querySelector('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog!.getAttribute('aria-label')).toBe("What's New dialog");
    });

    it('closes when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<WhatsNewModal onClose={onClose} />);
      const backdropBtn = document.querySelector('dialog > button[aria-label="Close dialog"]')!;
      fireEvent.click(backdropBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape via cancel event', () => {
      const onClose = vi.fn();
      render(<WhatsNewModal onClose={onClose} />);
      const dialog = document.querySelector('dialog')!;
      fireEvent(dialog, new Event('cancel', { bubbles: false }));
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

    it('renders native dialog when opened via ? key', () => {
      render(<KeyboardShortcuts />);
      // The component listens for '?' key to open
      fireEvent.keyDown(document, { key: '?' });
      const dialog = document.querySelector('dialog');
      expect(dialog).not.toBeNull();
      expect(dialog!.getAttribute('aria-label')).toBe('Keyboard shortcuts dialog');
    });
  });
});
