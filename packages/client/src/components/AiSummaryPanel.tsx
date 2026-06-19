import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Loader2, TrendingUp, AlertTriangle, ListChecks } from "lucide-react";
import { useRef, useState } from "react";
import { apiGet } from "@/api/client";

type SummaryScope = "review" | "employee" | "team";

interface AiSummaryPanelProps {
  scope: SummaryScope;
  // review: review id; employee: user id; team: manager id
  id: string | number;
  // required for employee/team scopes
  cycleId?: string;
  title?: string;
  className?: string;
}

interface SummaryShape {
  narrative_summary: string;
  recommended_actions: string[];
  generated_at?: string;
  model?: string | null;
  competency_analysis?: {
    strengths?: Array<{ competency_name: string } | string>;
    weaknesses?: Array<{ competency_name: string } | string>;
    development_areas?: string[];
  };
}

function normalizeList(
  items: Array<{ competency_name: string } | string> | string[] | undefined,
): string[] {
  if (!items) return [];
  return items.map((i) => (typeof i === "string" ? i : i.competency_name)).filter(Boolean);
}

export function AiSummaryPanel({ scope, id, cycleId, title, className }: AiSummaryPanelProps) {
  // regenToken bumps the query key to force a one-shot regeneration request.
  const [regenToken, setRegenToken] = useState(0);
  const regenerateRef = useRef(false);

  const endpoint =
    scope === "review"
      ? `/ai-summary/review/${id}`
      : scope === "employee"
        ? `/ai-summary/employee/${id}`
        : `/ai-summary/team/${id}`;

  const enabled = scope === "review" ? Boolean(id) : Boolean(id) && Boolean(cycleId);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["ai-summary", scope, id, cycleId, regenToken],
    queryFn: () => {
      const params: Record<string, any> = {};
      if (scope !== "review") params.cycleId = cycleId;
      if (regenerateRef.current) {
        params.regenerate = 1;
        regenerateRef.current = false;
      }
      return apiGet<SummaryShape>(endpoint, params);
    },
    enabled,
  });

  const summary = data?.data;

  const strengths = normalizeList(summary?.competency_analysis?.strengths);
  const devAreas = normalizeList(
    summary?.competency_analysis?.development_areas ?? summary?.competency_analysis?.weaknesses,
  );

  const handleRegenerate = () => {
    regenerateRef.current = true;
    setRegenToken((t) => t + 1);
  };

  return (
    <div className={`rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Sparkles className="h-5 w-5 text-brand-600" />
          {title ?? "AI Performance Summary"}
        </h2>
        <button
          onClick={handleRegenerate}
          disabled={!enabled || isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Regenerate
        </button>
      </div>

      {!enabled ? (
        <p className="mt-4 text-sm text-gray-500">
          {scope === "review"
            ? "Summary unavailable."
            : "Select a review cycle to generate a summary."}
        </p>
      ) : isLoading ? (
        <div className="mt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">Failed to generate summary. Please try again.</p>
      ) : summary ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-gray-700">{summary.narrative_summary}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {strengths.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Strengths
                </p>
                <ul className="space-y-1">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm text-gray-700">• {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {devAreas.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Development Areas
                </p>
                <ul className="space-y-1">
                  {devAreas.map((s, i) => (
                    <li key={i} className="text-sm text-gray-700">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {summary.recommended_actions?.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <ListChecks className="h-3.5 w-3.5" />
                Recommended Actions
              </p>
              <ul className="space-y-1.5">
                {summary.recommended_actions.map((a, i) => (
                  <li key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-700 border border-gray-100">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.generated_at && (
            <p className="text-xs text-gray-400">
              Generated {new Date(summary.generated_at).toLocaleString()}
              {summary.model ? ` · ${summary.model}` : ""}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
