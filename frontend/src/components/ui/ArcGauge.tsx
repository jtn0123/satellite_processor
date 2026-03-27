interface ArcGaugeProps {
  percent: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
}

/** SVG ring/arc chart for displaying a percentage value. */
export default function ArcGauge({
  percent,
  color = 'var(--color-primary)',
  size = 48,
  strokeWidth = 4,
}: Readonly<ArcGaugeProps>) {
  const clampedPercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedPercent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-gray-200 dark:stroke-space-700"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}
