import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionBar({
  id,
  icon: Icon,
  title,
  children,
}: {
  id?: string;
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-bar">
      <h2 id={id}>
        {Icon && <Icon aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </div>
  );
}
