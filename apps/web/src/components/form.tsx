/**
 * Form primitives shared by the auth screens and, later, the profile and application forms.
 *
 * Accessibility rules baked in here so screens cannot forget them (WCAG AA):
 * - every input has a real <label> bound by htmlFor/id
 * - hints and errors are linked to the input with aria-describedby
 * - errors are announced with role="alert"
 * - focus styles come from globals.css, never removed
 *
 * These are plain components. Interactivity lives in the page that uses them.
 */
import type { InputHTMLAttributes, ReactNode } from 'react';

/** Build the aria-describedby value for a field from its hint and error ids. */
export function describedBy(id: string, { hint, error }: { hint?: string; error?: string }): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

/**
 * Label, optional hint, the control itself, and an optional error message.
 * The control must set aria-describedby using describedBy(id, { hint, error }).
 */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-deep">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  invalid?: boolean;
};

export function TextInput({ id, invalid, className, ...rest }: TextInputProps) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      className={[
        'min-h-11 w-full rounded-lg border bg-paper-raised px-3 py-2 text-base text-text',
        'placeholder:text-muted/70',
        invalid ? 'border-danger' : 'border-line',
        className ?? '',
      ].join(' ')}
      {...rest}
    />
  );
}

export function SubmitButton({
  children,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-11 w-full rounded-full bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
