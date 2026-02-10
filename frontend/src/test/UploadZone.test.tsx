import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UploadZone from '../components/Upload/UploadZone';

vi.mock('../hooks/useApi', () => ({
  useUploadImage: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('UploadZone', () => {
  it('renders upload area', () => {
    render(<UploadZone />, { wrapper });
    expect(document.body.textContent).toBeTruthy();
  });
});
