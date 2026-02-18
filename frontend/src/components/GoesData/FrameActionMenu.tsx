import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, GitCompare, Tag, FolderPlus, Trash2 } from 'lucide-react';

export interface FrameActionMenuProps {
  onCompare: () => void;
  onTag: () => void;
  onAddToCollection: () => void;
  onDelete: () => void;
}

/**
 * Overflow ⋯ menu for secondary frame actions.
 */
export default function FrameActionMenu({
  onCompare,
  onTag,
  onAddToCollection,
  onDelete,
}: Readonly<FrameActionMenuProps>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const items = [
    { label: 'Compare', icon: GitCompare, onClick: onCompare },
    { label: 'Tag', icon: Tag, onClick: onTag },
    { label: 'Add to Collection', icon: FolderPlus, onClick: onAddToCollection },
    { label: 'Delete', icon: Trash2, onClick: onDelete, danger: true },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-gray-500 dark:text-slate-400"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px]" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm min-h-[44px] transition-colors ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
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
