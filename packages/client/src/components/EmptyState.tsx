import type { ComponentType, ReactNode } from "react";

// Shared empty-state block — centered icon + title + optional description +
// optional action. Replaces the "No X yet" card copy-pasted across ~24 pages.
//
// `bordered` (default true) wraps it in the standard card; pass false when the
// empty state already sits inside a bordered container (e.g. a table card).
//
//   <EmptyState icon={Users} title="No meetings found" description="…" />
//   <EmptyState icon={AlertTriangle} title="No PIPs found." bordered={false} />
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = true,
  className = "mt-6",
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        (bordered
          ? "rounded-xl border border-gray-200 bg-white p-12 text-center "
          : "p-12 text-center ") + className
      }
    >
      {Icon && <Icon className="mx-auto h-12 w-12 text-gray-300" />}
      <h3 className="mt-4 text-lg font-medium text-gray-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
