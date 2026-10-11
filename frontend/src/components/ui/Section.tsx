// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';
import { ui } from '@/lib/ui';

// A shared card. With a title it is a labelled <section>; without, a plain card.
export default function Section({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`${ui.card} ${ui.cardPad} ${className}`} aria-labelledby={title ? id : undefined}>
      {title && (
        <div className="mb-3">
          <h2 id={id} className={ui.h2}>{title}</h2>
          {subtitle && <p className={`${ui.meta} mt-1`}>{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
