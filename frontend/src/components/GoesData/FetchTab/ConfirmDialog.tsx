interface ConfirmDialogProps {
  readonly satellite: string;
  readonly sector: string;
  readonly imageType: string;
  readonly band: string;
  readonly estimate: { frames: number; sizeMb: string } | null;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  satellite,
  sector,
  imageType,
  band,
  estimate,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4 m-0 w-full h-full max-w-none max-h-none backdrop:bg-black/50"
      onCancel={onCancel}
      onClose={onCancel}
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        className="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        onClick={onCancel}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl p-6 max-w-sm w-full space-y-4 border border-gray-200 dark:border-slate-700 mx-auto mt-[30vh]">
        <h3 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Confirm Fetch
        </h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
          <div>
            <span className="text-gray-400">Satellite:</span> {satellite}
          </div>
          <div>
            <span className="text-gray-400">Sector:</span> {sector}
          </div>
          <div>
            <span className="text-gray-400">Type:</span>{' '}
            {imageType === 'single' ? `Single Band (${band})` : imageType.replace('_', ' ')}
          </div>
          {estimate && (
            <div className="card-inner p-3 mt-2">
              <div className="font-medium">
                ~{estimate.frames} frames · ~{estimate.sizeMb} MB
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2 text-sm btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Starting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
