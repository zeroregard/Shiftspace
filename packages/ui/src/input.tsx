import type { InputHTMLAttributes, Ref } from 'react';
import clsx from 'clsx';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visual size variant */
  variant?: 'default' | 'ghost';
  /** Full-width (default: true) */
  fullWidth?: boolean;
  /** Ref forwarding */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Styled text input matching the Shiftspace design system.
 *
 * Usage:
 *   <Input placeholder="Search files..." value={q} onChange={e => setQ(e.target.value)} />
 *   <Input variant="ghost" className="font-semibold text-13" />
 */
export function Input({
  variant = 'default',
  fullWidth = true,
  inputRef,
  className,
  ...props
}: InputProps) {
  return (
    <input
      ref={inputRef}
      className={clsx(
        'text-11 text-text-primary bg-transparent outline-none placeholder:text-text-faint',
        variant === 'default' && 'border border-border-dashed rounded-md px-2 py-1.5',
        variant === 'ghost' && 'border border-border-dashed rounded px-1 py-0',
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  );
}
