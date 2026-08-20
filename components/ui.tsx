import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:opacity-50 shadow-card",
  secondary:
    "bg-raised text-ink border border-line hover:bg-hover shadow-card",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90 shadow-card",
} as const;

type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-raised p-6 shadow-card",
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-control border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-accent/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("mb-1.5 block text-sm font-medium text-ink", className)}
      {...props}
    />
  );
}

/** Small uppercase label above a title, as used on reference course cards. */
export function Eyebrow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "text-eyebrow font-semibold text-ink-accent uppercase",
        className,
      )}
      {...props}
    />
  );
}

const badgeStyles = {
  neutral: "bg-sunken text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  accent: "bg-accent-soft text-ink-accent",
  danger: "bg-danger-soft text-danger",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof badgeStyles;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Linear progress bar, 0–100. */
export function ProgressBar({
  value,
  className,
  tone = "accent",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "success";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
    >
      <div
        className={cx(
          "h-full rounded-full transition-all",
          tone === "success" ? "bg-success" : "bg-accent",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Circular progress ring with a percentage label. */
export function ProgressRing({
  value,
  size = 72,
}: {
  value: number;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-track"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="stroke-accent transition-all"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-ink text-sm font-semibold"
      >
        {clamped}%
      </text>
    </svg>
  );
}

export interface StreakDay {
  /** Single-letter weekday label. */
  label: string;
  /** ISO date, used as the accessible description. */
  date: string;
  active: boolean;
  isToday: boolean;
}

/**
 * Seven-day activity strip. Uxcel, Coursera, Codecademy and Brilliant all
 * render a streak this way rather than as a bare number — the dots show
 * which days were missed, which a count cannot.
 */
export function StreakDots({ days }: { days: StreakDay[] }) {
  return (
    <ul className="flex items-center gap-1.5">
      {days.map((day) => (
        <li key={day.date}>
          <span
            title={`${day.date}: ${day.active ? "completed a lesson" : "no activity"}`}
            className={cx(
              "flex size-7 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
              day.active
                ? "bg-streak text-white"
                : "bg-track text-subtle",
              day.isToday && !day.active && "ring-2 ring-streak/40",
            )}
          >
            {day.label}
          </span>
          <span className="sr-only">
            {day.date}: {day.active ? "completed a lesson" : "no activity"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      {icon && <div className="text-subtle">{icon}</div>}
      <h3 className="text-heading font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {action}
    </Card>
  );
}
