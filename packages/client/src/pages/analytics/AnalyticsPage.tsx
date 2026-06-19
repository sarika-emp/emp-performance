import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Target,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { apiGet } from "@/api/client";
import { AiSummaryPanel } from "@/components/AiSummaryPanel";
import { getUser } from "@/lib/auth-store";

interface OverviewData {
  activeCycles: number;
  pendingReviews: number;
  goalCompletionRate: number;
  pipCount: number;
  feedbackCount: number;
}

interface ReviewCycle {
  id: string;
  name: string;
  status: string;
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1", "#8b5cf6"];

export function AnalyticsPage() {
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiGet<OverviewData>("/analytics/overview"),
  });

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles-list", "analytics"],
    queryFn: () =>
      apiGet<{ data: ReviewCycle[]; total: number }>("/review-cycles", { perPage: 100 }),
  });

  const cycles = cyclesData?.data?.data || [];

  const { data: trendsData } = useQuery({
    queryKey: ["analytics", "trends"],
    queryFn: () => apiGet<any[]>("/analytics/trends"),
  });

  const { data: goalData } = useQuery({
    queryKey: ["analytics", "goal-completion"],
    queryFn: () => apiGet<any[]>("/analytics/goal-completion"),
  });

  // A1: real ratings-distribution wired to the selected cycle (no mock data).
  const { data: distData, isLoading: distLoading } = useQuery({
    queryKey: ["analytics", "ratings-distribution", selectedCycleId],
    queryFn: () =>
      apiGet<any[]>("/analytics/ratings-distribution", { cycleId: selectedCycleId }),
    enabled: !!selectedCycleId,
  });

  const overview = overviewData?.data;
  const trends = trendsData?.data || [];
  const goals = goalData?.data || [];

  // A1: bell curve built from real /analytics/ratings-distribution rows for
  // the chosen cycle. Buckets 1-5 are zero-filled so the chart is complete.
  const distRows = distData?.data || [];
  const distMap = new Map<string, number>();
  for (const row of distRows) {
    distMap.set(String(Number(row.rating)), Number(row.count) || 0);
  }
  const bellCurveData = ["1", "2", "3", "4", "5"].map((rating) => ({
    rating,
    count: distMap.get(rating) ?? 0,
  }));
  const hasDistData = distRows.length > 0;

  // Real goal-completion data, grouped by category. Drop the dummy
  // fallback — it gave the misleading impression there were goals when
  // the org actually had none (#22).
  const pieData = goals.map((g: any) => ({
    name: (g.category || "Other").replace(/_/g, " "),
    value: Number(g.total) || 0,
    completed: Number(g.completed) || 0,
  }));

  // A1: trends from real data only — no fabricated Q1-Q4 2025 fallback.
  const lineData = trends.map((t: any) => ({
    name: t.cycle_name,
    avgRating: parseFloat(t.avg_rating) || 0,
    reviews: Number(t.review_count) || 0,
  }));

  const currentUser = getUser();

  const statCards = [
    {
      label: "Active Cycles",
      value: overview?.activeCycles ?? 0,
      icon: RefreshCw,
      color: "text-blue-600 bg-blue-50",
      to: "/review-cycles?status=active",
    },
    {
      label: "Pending Reviews",
      value: overview?.pendingReviews ?? 0,
      icon: BarChart3,
      color: "text-amber-600 bg-amber-50",
      to: "/reviews",
    },
    {
      label: "Goal Completion",
      value: `${overview?.goalCompletionRate ?? 0}%`,
      icon: Target,
      color: "text-green-600 bg-green-50",
      to: "/goals",
    },
    {
      label: "Active PIPs",
      value: overview?.pipCount ?? 0,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50",
      to: "/pips",
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">Performance analytics and reporting.</p>
        </div>
        {/* A1: cycle selector drives the ratings-distribution chart */}
        <div className="relative">
          <select
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-gray-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Select cycle for distribution...</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Stat Cards */}
      {overviewLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                to={card.to}
                className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-brand-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Charts Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ratings Distribution - Bell Curve Bar Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Ratings Distribution</h2>
          <p className="mt-1 text-sm text-gray-500">Bell curve of performance ratings</p>
          {!selectedCycleId ? (
            <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
              <BarChart3 className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">Select a review cycle to see the distribution</p>
            </div>
          ) : distLoading ? (
            <div className="mt-4 flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : !hasDistData ? (
            <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
              <BarChart3 className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No submitted ratings for this cycle yet</p>
            </div>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bellCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Goal Completion - Pie Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Goal Completion</h2>
          <p className="mt-1 text-sm text-gray-500">Completion by category</p>
          {pieData.length === 0 ? (
            <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
              <Target className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No goal data yet</p>
              <Link to="/goals/new" className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                Create the first goal
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((_: any, idx: number) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name: string, props: any) => {
                        const total = Number(props?.payload?.value) || 0;
                        const done = Number(props?.payload?.completed) || 0;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return [`${done}/${total} (${pct}%)`, props?.payload?.name];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pieData.map((d: any, idx: number) => {
                  const pct = d.value > 0 ? Math.round((d.completed / d.value) * 100) : 0;
                  return (
                    <li key={d.name} className="flex items-center gap-2 text-xs text-gray-600">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="capitalize font-medium text-gray-900">{d.name}</span>
                      <span className="text-gray-400">— {d.completed}/{d.value} ({pct}%)</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Trends - Line Chart (full width) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Performance Trends</h2>
          <p className="mt-1 text-sm text-gray-500">Average ratings over review cycles</p>
          {lineData.length === 0 ? (
            <div className="mt-4 flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
              <BarChart3 className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No review cycle trend data yet</p>
            </div>
          ) : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgRating"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Avg Rating"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* A3: AI team summary for the signed-in manager (uses the selected cycle) */}
      {currentUser && (
        <div className="mt-8">
          <AiSummaryPanel
            scope="team"
            id={currentUser.empcloudUserId}
            cycleId={selectedCycleId}
            title="AI Team Summary"
          />
        </div>
      )}
    </div>
  );
}
