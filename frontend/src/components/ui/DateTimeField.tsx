import { useId } from 'react';

export interface DateTimeFieldProps {
  /** Visible label (also becomes the accessible name). */
  readonly label: string;
  /** Controlled value in `datetime-local` format (`YYYY-MM-DDTHH:mm`). */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Optional extra classes for the input element. */
  readonly inputClassName?: string;
  /** Optional extra classes for the label element. */
  readonly labelClassName?: string;
  readonly disabled?: boolean;
  readonly min?: string;
  readonly max?: string;
  /** Optional stable id (used for tests / htmlFor associations). */
  readonly id?: string;
  /** Extra description shown to AT and sighted users below the field. */
  readonly hint?: string;
}

/**
 * Accessible wrapper around `<input type="datetime-local">`.
 *
 * - Associates a single visible `<label>` via `htmlFor` (no duplicated
 *   `aria-label`), so assistive tech announces the label once instead of
 *   "Month Month", "Day Day", ... (see JTN-422).
 * - The label itself is unique (e.g. "Start date and time" vs "End date
 *   and time") so sibling pickers are distinguishable.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  inputClassName = '',
  labelClassName = '',
  disabled,
  min,
  max,
  id,
  hint,
}: DateTimeFieldProps) {
  const reactId = useId();
  const inputId = id ?? `dtf-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={inputId}
        className={
          labelClassName ||
          'block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1'
        }
      >
        {label}
      </label>
      <input
        id={inputId}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        aria-describedby={hintId}
        className={
          inputClassName ||
          'w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2'
        }
      />
      {hint && (
        <p id={hintId} className="text-xs text-gray-400 dark:text-slate-500 mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

