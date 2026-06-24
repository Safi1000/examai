"use client";

import { useId } from "react";
import { color } from "@/lib/tokens";

export interface LinePoint {
  label: string;
  value: number; // 0..max
}

/**
 * Hand-rolled SVG score-trend line. Draws in on first paint (reduced-motion
 * disables the animation globally). No charting dependency.
 */
export function LineChart({
  points,
  max = 100,
  height = 200,
}: {
  points: LinePoint[];
  max?: number;
  height?: number;
}) {
  const gradId = useId();
  const W = 320;
  const H = height;
  const padX = 28;
  const padY = 22;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  if (points.length === 0) return null;

  const isSingle = points.length === 1;

  const x = (i: number) =>
    isSingle ? padX + innerW / 2 : padX + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${padX},${padY + innerH} ${line} ${x(points.length - 1)},${padY + innerH}`;
  const gridVals = [0, 25, 50, 75, 100].filter((g) => g <= max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score trend over time">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.brand} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color.brand} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke={color.border} strokeWidth="1" />
          <text x={padX - 6} y={y(g) + 3} textAnchor="end" fontSize="8" fill={color.ink3} className="tabular">
            {g}
          </text>
        </g>
      ))}

      {!isSingle && <polygon points={area} fill={`url(#${gradId})`} />}
      {!isSingle && (
        <polyline
          points={line}
          fill="none"
          stroke={color.brand}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "draw 1.1s var(--ease-out) forwards" }}
        />
      )}

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={color.surface} stroke={color.brand} strokeWidth="2.5" />
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="8" fill={color.ink3}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
