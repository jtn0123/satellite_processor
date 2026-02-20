import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Satellite, ExternalLink, Clock } from 'lucide-react';
import api from '../api/client';

interface SharedFrame {
  id: string;
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  width: number | null;
  height: number | null;
  file_size: number;
  expires_at: string;
}

function formatTimeRemaining(expiresAt: string): { text: string; urgent: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', urgent: true };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { text: `Expires in ${days}d ${hours % 24}h`, urgent: false };
  }
  if (hours > 0) {
    return { text: `Expires in ${hours}h ${minutes}m`, urgent: hours < 6 };
  }
  return { text: `Expires in ${minutes}m`, urgent: true };
}

export default function SharedFramePage() {
  const { token } = useParams<{ token: string }>();

  const { data: frame, isLoading, error } = useQuery<SharedFrame>({
    queryKey: ['shared', token],
    queryFn: () => api.get(`/shared/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !frame) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <Satellite className="w-16 h-16 mx-auto text-gray-600" />
          <h1 className="text-2xl font-bold">
            {status === 410 ? 'Link Expired' : 'Not Found'}
          </h1>
          <p className="text-gray-400">
            {status === 410
              ? 'This share link has expired.'
              : 'This share link is invalid or has been removed.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4">
      <div className="max-w-4xl w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              {frame.satellite} · {frame.band} · {frame.sector}
            </h1>
            <p className="text-sm text-gray-400">
              {new Date(frame.capture_time).toLocaleString()}
              {frame.width && frame.height ? ` · ${frame.width}×${frame.height}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {frame.expires_at && (() => {
              const { text, urgent } = formatTimeRemaining(frame.expires_at);
              return (
                <span className={`flex items-center gap-1.5 text-xs ${urgent ? 'text-amber-400' : 'text-gray-400'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {text}
                </span>
              );
            })()}
            <a
              href={`/api/shared/${token}/image`}
              download
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-gray-900 dark:text-white font-medium hover:bg-primary/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Download
            </a>
          </div>
        </div>
        <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center">
          <img
            src={`/api/shared/${token}/image`}
            alt={`${frame.satellite} ${frame.band} ${frame.sector}`}
            className="max-w-full max-h-[80vh] object-contain"
          />
        </div>
        <p className="text-xs text-gray-600 text-center">
          Shared from Satellite Processor · GOES satellite imagery
        </p>
      </div>
    </div>
  );
}
