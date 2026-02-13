import { ChevronRight } from 'lucide-react';

export interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export default function Breadcrumb({ segments }: BreadcrumbProps) {
  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-400">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={`${seg.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
            {isLast || !seg.onClick ? (
              <span className={isLast ? 'text-white font-medium' : ''}>{seg.label}</span>
            ) : (
              <button
                onClick={seg.onClick}
                className="hover:text-white transition-colors"
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
