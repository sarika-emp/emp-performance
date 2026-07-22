import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A small status/type pill. Pass the color classes (from the page's own status
// map) as `colorClass`; this component owns the shared pill wrapper markup that
// was previously re-typed at every call site. An optional leading `icon` is
// rendered with a gap.
//
//   <StatusBadge colorClass={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</StatusBadge>
//   <StatusBadge colorClass={badge.class} icon={<badge.icon className="h-3 w-3" />}>Draft</StatusBadge>
export function StatusBadge({
  colorClass,
  icon,
  children,
  className,
}: {
  colorClass?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass || "bg-gray-100 text-gray-700",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
