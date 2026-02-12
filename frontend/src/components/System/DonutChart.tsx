interface DonutChartProps {
  value: number;   // 0-100
  color: string;
  size?: number;
}

export default function DonutChart({ value, color, size = 96 }: Readonly<DonutChartProps>) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);

  return (
    <svg width={size} height={size} viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#334155" strokeWidth="10" />
      <circle
        cx="48" cy="48" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 48 48)"
      />
      <text
        x="48" y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={size < 64 ? 14 : 18}
        fontWeight="bold"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}
