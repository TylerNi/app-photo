import type { ReactNode } from 'react';

export function Button({
  variant = 'primary',
  disabled = false,
  type = 'button',
  onClick,
  children,
}: {
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`button button-${variant}`} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
