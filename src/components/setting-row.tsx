import type { ReactNode } from 'react';

export function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <label className="setting-row">
      <span>
        {title}
        {description && <span className="control-help">{description}</span>}
      </span>
      {control}
    </label>
  );
}
