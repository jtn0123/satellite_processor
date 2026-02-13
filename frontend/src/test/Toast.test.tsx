import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ToastContainer from '../components/Toast';

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });
});
