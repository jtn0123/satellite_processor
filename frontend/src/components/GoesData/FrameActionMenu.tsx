import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, GitCompare, Tag, FolderPlus, Share2, Trash2 } from 'lucide-react';

interface FrameActionMenuProps {
  onCompare: () => void;
  onTag: () => void;
  onAddToCollection: () => void;
  onShare: () => void;
  onDelete: () => void;
}

/**
 * Overflow menu (⋯) for secondary frame actions.
 * Touch-friendly with min 44px targets.
 */
export default function FrameActionMenu({
  onCompare,
  onTag,
  onAddToCollection,
  onShare,
  onDelete,
}: Readonly<FrameActionMenuProps>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const items = [
    { icon: GitCompare, label: 'Compare', action: onCompare },
    { icon: Tag, label: 'Tag', action: onTag },
    { icon: FolderPlus, label: 'Add to Collection', action: onAddToCollection },
    { icon: Share2, label: 'Share', action: onShare },
    { icon: Trash2, label: 'Delete', action: onDelete, danger: true },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4 text-gray-500 dark:text-slate-400" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-48 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-xl py-1 animate-fade-in"
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); item.action(); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 min-h-[44px] text-sm transition-colors ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
