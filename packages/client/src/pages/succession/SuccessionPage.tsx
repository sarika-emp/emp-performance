import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Loader2,
  Plus,
  Users,
  Shield,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import type { PaginatedResponse } from "@emp-performance/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { useTranslation } from "react-i18next";

interface SuccessionPlan {
  id: string;
  organization_id: number;
  position_title: string;
  current_holder_id: number | null;
  department: string | null;
  criticality: string;
  status: string;
  candidate_count: number;
  created_at: string;
}

const CRITICALITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "bg-blue-100 text-blue-700",
  developing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
};

export function SuccessionPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [criticality, setCriticality] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    position_title: "",
    department: "",
    criticality: "medium",
    current_holder_id: "",
  });

  const { data: plansData, isLoading } = useQuery({
    queryKey: ["succession-plans", page, search, criticality, status],
    queryFn: () =>
      apiGet<PaginatedResponse<SuccessionPlan>>("/succession-plans", {
        page,
        perPage: 20,
        ...(search && { search }),
        ...(criticality && { criticality }),
        ...(status && { status }),
      }),
  });

  const plans = plansData?.data?.data || [];
  const pagination = plansData?.data;

  const createMutation = useMutation({
    mutationFn: (body: any) => apiPost("/succession-plans", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plans"] });
      setShowCreate(false);
      setPage(1);
      setForm({ position_title: "", department: "", criticality: "medium", current_holder_id: "" });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      position_title: form.position_title,
      department: form.department || undefined,
      criticality: form.criticality,
      current_holder_id: form.current_holder_id ? Number(form.current_holder_id) : undefined,
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-brand-600" />
            {t("succession.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("succession.subtitle")}
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          {t("succession.newPlan")}
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t("succession.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={criticality}
          onChange={(e) => {
            setCriticality(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("succession.allCriticality")}</option>
          <option value="low">{t("succession.criticality.low")}</option>
          <option value="medium">{t("succession.criticality.medium")}</option>
          <option value="high">{t("succession.criticality.high")}</option>
          <option value="critical">{t("succession.criticality.critical")}</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("succession.allStatuses")}</option>
          <option value="identified">{t("succession.status.identified")}</option>
          <option value="developing">{t("succession.status.developing")}</option>
          <option value="ready">{t("succession.status.ready")}</option>
        </select>
      </div>

      {/* Create Form Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t("succession.createTitle")}</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("succession.positionTitle")} *
                </label>
                <input
                  type="text"
                  value={form.position_title}
                  onChange={(e) => setForm({ ...form, position_title: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder={t("succession.positionPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("succession.department")}
                </label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder={t("succession.departmentPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("succession.currentHolderId")}
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.current_holder_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) {
                      setForm({ ...form, current_holder_id: v });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "-" || e.key === "e" || e.key === "+") {
                      e.preventDefault();
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder={t("succession.holderPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("succession.criticalityLabel")}
                </label>
                <select
                  value={form.criticality}
                  onChange={(e) => setForm({ ...form, criticality: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="low">{t("succession.criticality.low")}</option>
                  <option value="medium">{t("succession.criticality.medium")}</option>
                  <option value="high">{t("succession.criticality.high")}</option>
                  <option value="critical">{t("succession.criticality.critical")}</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t("succession.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("succession.createPlan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plans List */}
      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-gray-400">
          <Shield className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">{t("succession.emptyTitle")}</p>
          <p className="text-sm">{t("succession.emptyDescription")}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              to={`/succession/${plan.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-200 hover:shadow-md transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-gray-900 truncate">
                    {plan.position_title}
                  </h3>
                  <StatusBadge colorClass={CRITICALITY_COLORS[plan.criticality] || CRITICALITY_COLORS.medium}>
                    {t(`succession.criticality.${plan.criticality}`)}
                  </StatusBadge>
                  <StatusBadge colorClass={STATUS_COLORS[plan.status] || STATUS_COLORS.identified}>
                    {t(`succession.status.${plan.status}`)}
                  </StatusBadge>
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                  {plan.department && <span>{plan.department}</span>}
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {t("succession.candidateCount", { count: plan.candidate_count })}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          ))}
        </div>
      )}

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
