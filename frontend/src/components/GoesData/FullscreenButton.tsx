import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onClick: () => void;
}

export default function FullscreenButton({
  isFullscreen,
  onClick,
}: Readonly<FullscreenButtonProps>) {
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const Icon = isFullscreen ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 rounded-lg glass-t1 text-white/80 hover:text-white hover:scale-105 active:scale-95 transition-all duration-150 min-h-[44px] min-w-[44px]"
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
