"use client";

import type { ReactNode } from "react";
import type { AlertLevel } from "@/lib/types";
import { ALERT_COLOR } from "@/lib/format";

export function AlertChip({ level, small }: { level: AlertLevel; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold tracking-wide ${small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs"}`}
      style={{ background: `${ALERT_COLOR[level]}22`, color: ALERT_COLOR[level], border: `1px solid ${ALERT_COLOR[level]}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ALERT_COLOR[level] }} />
      {level}
    </span>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/70 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold leading-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function ProbBar({ p, color = "#38bdf8", width = 64 }: { p: number; color?: string; width?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-1.5 overflow-hidden rounded-full bg-slate-800" style={{ width }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, background: color }} />
      </span>
      <span className="tabular w-8 text-right text-[11px] text-slate-300">{Math.round(p * 100)}%</span>
    </span>
  );
}

export function lossColor(p: number): string {
  if (p >= 0.85) return "#ef4444";
  if (p >= 0.6) return "#f97316";
  if (p >= 0.3) return "#eab308";
  return "#22c55e";
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  title?: string;
  className?: string;
}) {
  const styles = {
    primary: "bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    ghost: "text-slate-300 hover:bg-slate-800",
    danger: "bg-rose-600 text-white hover:bg-rose-500 font-semibold",
  }[variant];
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-slate-300">{label}</span>
        {hint && <span className="tabular text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">{children}</div>;
}
