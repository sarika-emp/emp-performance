import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, Clock, ShieldCheck } from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface ReviewCycle {
  id: string;
  name: string;
  status: string;
}

interface Nomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  nominated_by: number;
  created_at: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "", label: "All" },
];

const STATUS_BADGE: Record<string, { className: string; icon: typeof Check }> = {
  pending: { className: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { className: "bg-green-50 text-green-700", icon: Check },
  declined: { className: "bg-red-50 text-red-700", icon: X },
};

export function PeerReviewQueuePage() {
  const queryClient = useQueryClient();
  const [cycleId, setCycleId] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles", "for-queue"],
    queryFn: () => apiGet<Paginated<ReviewCycle>>("/review-cycles", { page: 1, perPage: 100 }),
  });
  const cycles = cyclesData?.data?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["peer-nominations", "queue", cycleId, statusFilter, page],
    enabled: !!cycleId,
    queryFn: () =>
      apiGet<Paginated<Nomination>>("/peer-reviews/nominations", {
        cycleId,
        page,
        perPage: 20,
        ...(statusFilter && { status: statusFilter }),
      }),
  });
  const nominations = data?.data?.data ?? [];
  const pagination = data?.data;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/peer-reviews/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peer-nominations"] });
      toast.success("Nomination approved");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to approve"),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/peer-reviews/${id}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peer-nominations"] });
      toast.success("Nomination declined");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to decline"),
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peer Review Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve peer reviewer nominations for a cycle.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={cycleId}
          onChange={(e) => {
            setCycleId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">— Select a cycle —</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.status})
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!cycleId ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Select a review cycle</h3>
          <p className="mt-1 text-sm text-gray-500">
            Choose a cycle above to see its peer nominations.
          </p>
        </div>
      ) : isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : nominations.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No nominations</h3>
          <p className="mt-1 text-sm text-gray-500">
            There are no {statusFilter || ""} nominations for this cycle.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Peer Reviewer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nominated</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {nominations.map((n) => {
                const badge = STATUS_BADGE[n.status] || STATUS_BADGE.pending;
                const BadgeIcon = badge.icon;
                const pending = n.status === "pending";
                return (
                  <tr key={n.id}>
                    <td className="px-4 py-3 text-sm text-gray-700">User #{n.employee_id}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">User #{n.nominee_id}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(n.created_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge.className}`}
                      >
                        <BadgeIcon className="h-3 w-3" />
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pending ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => approveMutation.mutate(n.id)}
                            disabled={approveMutation.isPending || declineMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => declineMutation.mutate(n.id)}
                            disabled={approveMutation.isPending || declineMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
