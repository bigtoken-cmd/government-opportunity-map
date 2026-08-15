"use client";

import type { ReactNode } from "react";

export function ProgressRail({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <span
      className="question-progress-rail"
      role="progressbar"
      aria-label={`Profile step ${current + 1} of ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={index === current ? "question-progress-current" : index < current ? "question-progress-complete" : ""}
        />
      ))}
    </span>
  );
}

export function SignalMeter({
  level,
  tone = "blue",
}: {
  level: number;
  tone?: "blue" | "green" | "amber" | "violet";
}) {
  return (
    <span className={`signal-meter signal-meter-${tone}`} aria-hidden="true">
      {[1, 2, 3].map((bar) => <span key={bar} data-active={bar <= level} />)}
    </span>
  );
}

export function ContextCard({
  title,
  meta,
  children,
  footer,
  wide = false,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`context-card ${wide ? "context-card-wide" : ""}`}>
      <header>
        <span className="context-card-mark" aria-hidden="true"><span /><span /><span /></span>
        <h3>{title}</h3>
        {meta && <span className="context-card-meta">{meta}</span>}
      </header>
      <div className="context-card-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

export type TaskRowItem = {
  id: string;
  label: string;
  detail?: string;
};

export function TaskRows({
  items,
  checked,
  onChange,
}: {
  items: ReadonlyArray<TaskRowItem>;
  checked: Record<string, boolean>;
  onChange: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="task-row-list">
      {items.map((item, index) => {
        const complete = Boolean(checked[item.id]);
        return (
          <label key={item.id} className={`task-row ${complete ? "task-row-complete" : ""}`}>
            <span className="task-row-status" aria-hidden="true">{complete ? "✓" : index + 1}</span>
            <span className="task-row-copy">
              <strong>{item.label}</strong>
              {item.detail && <span>{item.detail}</span>}
            </span>
            <span className="task-row-state">{complete ? "Complete" : "To do"}</span>
            <input
              type="checkbox"
              checked={complete}
              onChange={(event) => onChange(item.id, event.target.checked)}
              aria-label={`${complete ? "Mark incomplete" : "Mark complete"}: ${item.label}`}
            />
          </label>
        );
      })}
    </div>
  );
}
