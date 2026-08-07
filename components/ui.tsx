import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300 shadow-sm",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
} as const;

type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(buttonBase, buttonStyles[variant], className)}
      {...props}
    />
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

export function Card({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("mb-1.5 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

const badgeStyles: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  brand: "bg-brand-100 text-brand-700",
  rose: "bg-rose-100 text-rose-700",
};

export function Badge({
  tone = "slate",
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
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
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
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}
    >
      <div
        className="h-full rounded-full bg-brand-600 transition-all"
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
  const stroke = 7;
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
        className="stroke-slate-100"
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
        className="stroke-brand-600 transition-all"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-slate-900 text-sm font-semibold"
      >
        {clamped}%
      </text>
    </svg>
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
      {icon && <div className="text-slate-300">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
      {action}
    </Card>
  );
}
