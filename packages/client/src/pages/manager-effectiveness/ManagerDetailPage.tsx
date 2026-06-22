import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw, Trash2, Gauge } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost, apiDelete } from "@/api/client";

interface Breakdown {
  team_performance: {
    avg_team_rating: number | null;
    team_size: number;
    description: string;
  };
  review_quality: {
    reviews_completed_on_time_pct: number | null;
    rating_variance: number | null;
    description: string;
  };
  engagement: {
    one_on_one_frequency: number | null;
    feedback_given_count: number;
    goal_completion_rate: number | null;
    description: string;
  };
}

interface ManagerDetail {
  manager_user_id: number;
  manager_name?: string;
  department?: string | null;
  period: string;
  overall_score: number | null;
  team_performance_score: number | null;
  review_quality_score: number | null;
  engagement_score: number | null;
  team_size: number;
  calculated_at: string;
  breakdown: Breakdown;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${scoreColor(value)}`}>{value?.toFixed(1) ?? "—"}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ManagerDetailPage() {
  const { managerId } = useParams<{ managerId: string }>();
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") || "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["me-detail", managerId, period],
    queryFn: () =>
      apiGet<ManagerDetail>(`/manager-effectiveness/${managerId}`, { period }),
    enabled: Boolean(managerId) && Boolean(period),
  });

  const detail = data?.data;

  const recalculate = useMutation({
    mutationFn: () =>
      apiPost(`/manager-effectiveness/calculate/${managerId}`, { period }),
    onSuccess: () => {
      toast.success("Score recalculated");
      queryClient.invalidateQueries({ queryKey: ["me-detail", managerId, period] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Recalculation failed"),
  });

  const remove = useMutation({
    mutationFn: () =>
      apiDelete(`/manager-effectiveness/${managerId}?period=${encodeURIComponent(period)}`),
    onSuccess: () => {
      toast.success("Score deleted");
      navigate("/manager-effectiveness");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Delete failed"),
  });

  if (!period) {
    return (
      <div className="py-12 text-center text-gray-500">
        No period specified. Return to the list and pick a manager.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-gray-500">No score found for this manager in {period}.</p>
        <button
          onClick={() => recalculate.mutate()}
          disabled={recalculate.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {recalculate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Calculate Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate(-1)}
            className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Gauge className="h-6 w-6 text-brand-600" />
              {detail.manager_name || `Manager ${detail.manager_user_id}`}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {detail.period}
              {detail.department ? ` · ${detail.department}` : ""} · Team of {detail.team_size}
              {" · "}Calculated {new Date(detail.calculated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => recalculate.mutate()}
            disabled={recalculate.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {recalculate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalculate
          </button>
          <button
            onClick={() => {
              if (window.confirm("Delete this manager's score for the period?")) remove.mutate();
            }}
            disabled={remove.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Overall + component scores */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">Overall Score</p>
          <p className={`text-4xl font-bold ${scoreColor(detail.overall_score)}`}>
            {detail.overall_score?.toFixed(1) ?? "—"}
          </p>
        </div>
        <div className="mt-6 space-y-4">
          <ScoreBar label="Team Performance (40%)" value={detail.team_performance_score} />
          <ScoreBar label="Review Quality (30%)" value={detail.review_quality_score} />
          <ScoreBar label="Engagement (30%)" value={detail.engagement_score} />
        </div>
      </div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Team Performance</h3>
          <p className="mt-2 text-sm text-gray-600">{detail.breakdown.team_performance.description}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Avg team rating</dt>
              <dd className="font-medium text-gray-900">
                {detail.breakdown.team_performance.avg_team_rating ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Team size</dt>
              <dd className="font-medium text-gray-900">{detail.breakdown.team_performance.team_size}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Review Quality</h3>
          <p className="mt-2 text-sm text-gray-600">{detail.breakdown.review_quality.description}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">On-time %</dt>
              <dd className="font-medium text-gray-900">
                {detail.breakdown.review_quality.reviews_completed_on_time_pct ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Rating variance</dt>
              <dd className="font-medium text-gray-900">
                {detail.breakdown.review_quality.rating_variance ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Engagement</h3>
          <p className="mt-2 text-sm text-gray-600">{detail.breakdown.engagement.description}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">1-on-1 frequency</dt>
              <dd className="font-medium text-gray-900">
                {detail.breakdown.engagement.one_on_one_frequency ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Feedback given</dt>
              <dd className="font-medium text-gray-900">{detail.breakdown.engagement.feedback_given_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Goal completion</dt>
              <dd className="font-medium text-gray-900">
                {detail.breakdown.engagement.goal_completion_rate ?? "—"}%
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
