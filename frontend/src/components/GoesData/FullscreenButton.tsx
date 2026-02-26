import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onClick: () => void;
}

export default function FullscreenButton({ isFullscreen, onClick }: Readonly<FullscreenButtonProps>) {
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const Icon = isFullscreen ? Minimize2 : Maximize2;
  return (
    <button onClick={onClick}
      className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px]"
      title={label} aria-label={label}>
      <Icon className="w-4 h-4" />
    </button>
  );
}
