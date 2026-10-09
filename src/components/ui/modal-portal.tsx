'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

type ModalPortalProps = {
  children: ReactNode;
  className?: string;
};

export function ModalPortal({ children, className }: ModalPortalProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return createPortal(
    <div className={className}>{children}</div>,
    document.body,
  );
}
