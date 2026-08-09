"use client";

import { useId, type CSSProperties } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: SliderProps) {
  const id = useId();
  const mid = (min + max) / 2;
  const display =
    Math.abs(value) < 0.05 && step < 1
      ? value.toFixed(2)
      : Number.isInteger(step)
        ? String(Math.round(value))
        : value.toFixed(2);

  return (
    <label className="slider-row" htmlFor={id}>
      <span className="slider-label">
        <span>{label}</span>
        <span className="slider-value">{display}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--pct": `${((value - min) / (max - min)) * 100}%`,
            "--mid": `${((mid - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
    </label>
  );
}
