import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  src: string;
}

export default function VideoPlayer({ src }: Readonly<Props>) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-slate-400">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-medium">Video failed to load</p>
        <p className="text-xs text-gray-400 dark:text-slate-500">The video file may be missing or in an unsupported format.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-slate-800 rounded-xl overflow-hidden">
      <video
        src={src}
        controls
        className="w-full"
        style={{ maxHeight: '70vh' }}
        onError={() => setError(true)}
      >
        <track kind="captions" />
        Your browser does not support video playback.
      </video>
    </div>
  );
}
