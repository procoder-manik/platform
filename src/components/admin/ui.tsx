import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink hover:bg-raised',
  ghost: 'text-body hover:bg-raised hover:text-ink',
  danger: 'border border-danger text-danger hover:bg-raised',
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-button px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

const statusTone: Record<string, string> = {
  PUBLISHED: 'border-success text-success',
  SCHEDULED: 'border-warning text-warning',
  DRAFT: 'border-line text-muted',
};
const statusLabel: Record<string, string> = { PUBLISHED: 'Published', SCHEDULED: 'Scheduled', DRAFT: 'Draft' };

export function StatusChip({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone[value] ?? 'border-line text-muted'}`}>
      {statusLabel[value] ?? value}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  const tones = { info: 'border-line text-body', success: 'border-success text-success', error: 'border-danger text-danger', warning: 'border-warning text-warning' };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-input border bg-surface px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export const inputClass =
  'block min-h-10 w-full rounded-input border border-line bg-base px-3 text-sm text-ink placeholder:text-muted aria-[invalid=true]:border-danger';
