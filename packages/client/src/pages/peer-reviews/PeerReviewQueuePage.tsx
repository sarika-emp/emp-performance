import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, Clock, ShieldCheck } from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { useTranslation } from "react-i18next";
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
  { value: "pending" },
  { value: "approved" },
  { value: "declined" },
  { value: "" },
];

const STATUS_BADGE: Record<string, { className: string; icon: typeof Check }> = {
  pending: { className: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { className: "bg-green-50 text-green-700", icon: Check },
  declined: { className: "bg-red-50 text-red-700", icon: X },
};

export function PeerReviewQueuePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [cycleId, setCycleId] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending":
        return t("peerReviewQueue.statusPending");
      case "approved":
        return t("peerReviewQueue.statusApproved");
      case "declined":
        return t("peerReviewQueue.statusDeclined");
      case "":
        return t("peerReviewQueue.statusAll");
      default:
        return s;
    }
  };

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
      toast.success(t("peerReviewQueue.toastApproved"));
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || t("peerReviewQueue.toastApproveError")),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/peer-reviews/${id}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peer-nominations"] });
      toast.success(t("peerReviewQueue.toastDeclined"));
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || t("peerReviewQueue.toastDeclineError")),
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("peerReviewQueue.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("peerReviewQueue.subtitle")}
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
          <option value="">{t("peerReviewQueue.selectCyclePlaceholder")}</option>
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
              {statusLabel(tab.value)}
            </button>
          ))}
        </div>
      </div>

      {!cycleId ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("peerReviewQueue.selectCycleTitle")}
          description={t("peerReviewQueue.selectCycleDesc")}
          className="mt-8"
        />
      ) : isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : nominations.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("peerReviewQueue.noNominationsTitle")}
          description={t("peerReviewQueue.noNominationsDesc", { status: statusFilter || "" })}
          className="mt-8"
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("peerReviewQueue.colEmployee")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("peerReviewQueue.colPeerReviewer")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("peerReviewQueue.colNominated")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("common.status")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {nominations.map((n) => {
                const badge = STATUS_BADGE[n.status] || STATUS_BADGE.pending;
                const BadgeIcon = badge.icon;
                const pending = n.status === "pending";
                return (
                  <tr key={n.id}>
                    <td className="px-4 py-3 text-sm text-gray-700">{t("peerReviewQueue.userLabel", { id: n.employee_id })}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{t("peerReviewQueue.userLabel", { id: n.nominee_id })}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(n.created_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        colorClass={badge.className}
                        icon={<BadgeIcon className="h-3 w-3" />}
                        className="capitalize"
                      >
                        {statusLabel(n.status)}
                      </StatusBadge>
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
                            {t("peerReviewQueue.approve")}
                          </button>
                          <button
                            onClick={() => declineMutation.mutate(n.id)}
                            disabled={approveMutation.isPending || declineMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            {t("peerReviewQueue.decline")}
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
