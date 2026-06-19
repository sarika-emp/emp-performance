import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Gauge,
  Loader2,
  RefreshCw,
  Play,
  Users,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import toast from "react-hot-toast";
import { apiGet, apiPost } from "@/api/client";
import type { PaginatedResponse } from "@emp-performance/shared";

interface ManagerScore {
  id: string;
  manager_user_id: number;
  manager_name?: string;
  department?: string | null;
  period: string;
  overall_score: number | null;
  team_performance_score: number | null;
  review_quality_score: number | null;
  engagement_score: number | null;
  team_size: number;
}

interface DashboardStats {
  org_average: number | null;
  top_performers: ManagerScore[];
  bottom_performers: ManagerScore[];
  total_managers: number;
  period: string;
  score_distribution: Record<string, number>;
}

// Build the list of recent quarters for the period picker.
function buildPeriods(): string[] {
  const periods: string[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let quarter = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    periods.push(`${year}-Q${quarter}`);
    quarter -= 1;
    if (quarter < 1) {
      quarter = 4;
      year -= 1;
    }
  }
  return periods;
}

function scoreColor(score: number | null): string {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-blue-100 text-blue-700";
  if (score >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function ManagerEffectivenessPage() {
  const queryClient = useQueryClient();
  const PERIODS = buildPeriods();
  const [period, setPeriod] = useState<string>(PERIODS[0]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("overall_score");

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["me-dashboard"],
    queryFn: () => apiGet<DashboardStats>("/manager-effectiveness/dashboard"),
  });
  const dashboard = dashboardData?.data;

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["me-list", period, page, sort],
    queryFn: () =>
      apiGet<PaginatedResponse<ManagerScore>>("/manager-effectiveness", {
        period,
        page,
        perPage: 20,
        sort,
        order: "desc",
      }),
    enabled: !!period,
  });

  const scores = listData?.data?.data ?? [];
  const pager = listData?.data;

  const calculateAll = useMutation({
    mutationFn: () => apiPost("/manager-effectiveness/calculate-all", { period }),
    onSuccess: (res: any) => {
      const r = res?.data ?? {};
      toast.success(`Calculated ${r.calculated ?? 0} managers (${r.errors ?? 0} errors)`);
      queryClient.invalidateQueries({ queryKey: ["me-list"] });
      queryClient.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Calculation failed"),
  });

  const distData = dashboard
    ? Object.entries(dashboard.score_distribution).map(([bucket, count]) => ({
        bucket,
        count,
      }))
    : [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Gauge className="h-7 w-7 text-brand-600" />
            Manager Effectiveness
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Composite scores from team performance, review quality, and engagement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-gray-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={() => calculateAll.mutate()}
            disabled={calculateAll.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {calculateAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Calculate All
          </button>
        </div>
      </div>

      {/* Dashboard cards */}
      {dashboardLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Org Average</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {dashboard?.org_average != null ? dashboard.org_average.toFixed(1) : "—"}
            </p>
            <p className="mt-1 text-xs text-gray-400">Latest: {dashboard?.period || "n/a"}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Managers Scored</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{dashboard?.total_managers ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-500">Score Distribution</p>
            <div className="h-20">
              {distData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distData}>
                    <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                    <Tooltip />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-gray-400">No data</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top / bottom performers */}
      {dashboard && (dashboard.top_performers.length > 0 || dashboard.bottom_performers.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Top Performers
            </h3>
            <ul className="mt-3 space-y-2">
              {dashboard.top_performers.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{s.manager_name || `Manager ${s.manager_user_id}`}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${scoreColor(s.overall_score)}`}>
                    {s.overall_score?.toFixed(1) ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Needs Support
            </h3>
            <ul className="mt-3 space-y-2">
              {dashboard.bottom_performers.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{s.manager_name || `Manager ${s.manager_user_id}`}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${scoreColor(s.overall_score)}`}>
                    {s.overall_score?.toFixed(1) ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Scores table */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Manager Scores — {period}</h2>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-gray-700 focus:border-brand-500 focus:outline-none"
            >
              <option value="overall_score">Sort: Overall</option>
              <option value="team_performance_score">Sort: Team Performance</option>
              <option value="review_quality_score">Sort: Review Quality</option>
              <option value="engagement_score">Sort: Engagement</option>
              <option value="team_size">Sort: Team Size</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {listLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : scores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
            <Users className="h-10 w-10" />
            <p className="mt-2 text-sm">No scores for {period}. Run "Calculate All" to generate them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-6 py-3">Manager</th>
                  <th className="px-6 py-3">Team</th>
                  <th className="px-6 py-3">Overall</th>
                  <th className="px-6 py-3">Team Perf.</th>
                  <th className="px-6 py-3">Review Q.</th>
                  <th className="px-6 py-3">Engagement</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {s.manager_name || `Manager ${s.manager_user_id}`}
                      </p>
                      {s.department && <p className="text-xs text-gray-400">{s.department}</p>}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{s.team_size}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreColor(s.overall_score)}`}>
                        {s.overall_score?.toFixed(1) ?? "—"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {s.team_performance_score?.toFixed(0) ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {s.review_quality_score?.toFixed(0) ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {s.engagement_score?.toFixed(0) ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        to={`/manager-effectiveness/${s.manager_user_id}?period=${s.period}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        Detail <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pager && pager.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
            <p className="text-sm text-gray-500">
              Page {pager.page} of {pager.totalPages} ({pager.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pager.page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={pager.page >= pager.totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <RefreshCw className="hidden" />
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
