import { useCallback, useEffect, useRef, useState } from 'react';

export type HcpPoint = { label: string; hcp: number };

interface Props {
  data: HcpPoint[];
  /** Desktop height of the plot area */
  className?: string;
}

/**
 * Fully responsive HCP evolution line chart.
 * The SVG always matches the available container width (no horizontal scroll)
 * and keeps enough inner padding so the first/last labels are never clipped.
 */
const HcpEvolutionChart = ({ data, className }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const measure = useCallback(() => {
    if (containerRef.current) setWidth(containerRef.current.clientWidth);
  }, []);

  useEffect(() => {
    measure();
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  if (data.length < 2) return null;

  const isNarrow = width > 0 && width < 480;
  const chartW = Math.max(width || 280, 220);
  const plotH = isNarrow ? 78 : 60;
  const svgH = plotH + (isNarrow ? 42 : 20);
  // Inner padding: enough for the value labels of the first/last point
  const padX = Math.min(isNarrow ? 22 : 30, chartW / (data.length * 2));
  const padY = 22;
  const usableW = Math.max(chartW - padX * 2, 10);
  const usableH = plotH - padY * 2;

  const values = data.map((d) => d.hcp);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * usableW,
    y: padY + (1 - (d.hcp - min) / range) * usableH,
    hcp: d.hcp,
    label: d.label,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div ref={containerRef} className={className}>
      <svg
        width="100%"
        height={svgH}
        viewBox={`0 0 ${chartW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
        className="text-accent block"
        role="img"
        aria-label="Evolució HCP"
      >
        <polyline points={polyline} fill="none" stroke="hsl(var(--accent))" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="hsl(var(--accent))" />
            <text
              x={p.x}
              y={p.y - 9}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              className="fill-foreground text-[11px] font-mono font-semibold"
            >
              {p.hcp}
            </text>
            <text
              x={p.x}
              y={plotH + (isNarrow ? 26 : 14)}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[11px]"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default HcpEvolutionChart;
