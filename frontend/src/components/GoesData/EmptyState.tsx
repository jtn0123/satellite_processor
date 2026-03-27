import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* Rotating dashed outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30 animate-[spin_12s_linear_infinite]" />
        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-space-800 flex items-center justify-center text-gray-400 dark:text-slate-500">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md text-center">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-2 px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
