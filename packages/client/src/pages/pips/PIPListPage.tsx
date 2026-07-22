import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiDelete } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { useConfirm } from "@/components/ConfirmDialog";
import type { PerformanceImprovementPlan, PaginatedResponse } from "@emp-performance/shared";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "start_date:desc", label: "Start date (latest)" },
  { value: "start_date:asc", label: "Start date (earliest)" },
  { value: "end_date:asc", label: "End date (soonest)" },
  { value: "end_date:desc", label: "End date (latest)" },
  { value: "status:asc", label: "Status (A–Z)" },
];

const ADMIN_ROLES = new Set(["super_admin", "org_admin", "hr_admin", "hr_manager"]);

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  extended: "bg-amber-100 text-amber-700",
  completed_success: "bg-green-100 text-green-700",
  completed_failure: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  extended: "Extended",
  completed_success: "Completed (Success)",
  completed_failure: "Completed (Failure)",
  cancelled: "Cancelled",
};

interface PIPWithMeta extends PerformanceImprovementPlan {
  employee_name?: string;
  objectives_met?: number;
  objectives_total?: number;
}

export function PIPListPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("created_at:desc");
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = !!role && ADMIN_ROLES.has(role);

  const [sort, order] = sortValue.split(":") as [string, "asc" | "desc"];

  const { data, isLoading, error } = useQuery({
    queryKey: ["pips", page, status, search, sortValue],
    queryFn: () =>
      apiGet<PaginatedResponse<PIPWithMeta>>("/pips", {
        page,
        perPage: 20,
        sort,
        order,
        ...(status && { status }),
        ...(search && { search }),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/pips/${id}`),
    onSuccess: () => {
      toast.success("PIP deleted");
      queryClient.invalidateQueries({ queryKey: ["pips"] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete PIP"),
  });

  async function handleDelete(pip: PIPWithMeta) {
    const label = pip.employee_name ?? `Employee #${pip.employee_id}`;
    if (
      await confirm({
        title: "Delete PIP?",
        message: `Delete the PIP for ${label}? This removes it from the active list but preserves the record for audit.`,
        confirmLabel: "Delete",
        variant: "danger",
      })
    ) {
      deleteMutation.mutate(pip.id);
    }
  }

  const pips = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Performance Improvement Plans
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage active and historical PIPs.
          </p>
        </div>
        <Link
          to="/pips/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create PIP
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search PIPs..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="extended">Extended</option>
          <option value="completed_success">Completed (Success)</option>
          <option value="completed_failure">Completed (Failure)</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={sortValue}
          onChange={(e) => {
            setSortValue(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {isLoading && (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-500">Loading PIPs...</p>
          </div>
        )}

        {error && (
          <div className="p-6 text-center bg-red-50">
            <p className="text-sm text-red-600">Failed to load PIPs.</p>
          </div>
        )}

        {!isLoading && pips.length === 0 && (
          <EmptyState
            icon={AlertTriangle}
            title="No PIPs found."
            bordered={false}
            className=""
          />
        )}

        {!isLoading && pips.length > 0 && (
          <div className="overflow-x-auto -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Employee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Objectives
                </th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pips.map((pip) => (
                <tr key={pip.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      to={`/pips/${pip.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      {pip.employee_name ?? `Employee #${pip.employee_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700 line-clamp-1 max-w-xs">
                      {pip.reason}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge colorClass={STATUS_COLORS[pip.status] ?? "bg-gray-100 text-gray-700"}>
                      {STATUS_LABELS[pip.status] ?? pip.status}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatDate(pip.start_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {pip.extended_end_date
                      ? formatDate(pip.extended_end_date)
                      : formatDate(pip.end_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {pip.objectives_met !== undefined && pip.objectives_total !== undefined
                      ? `${pip.objectives_met}/${pip.objectives_total} met`
                      : "-"}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(pip)}
                        disabled={deleteMutation.isPending}
                        title="Delete PIP"
                        className="inline-flex items-center rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
