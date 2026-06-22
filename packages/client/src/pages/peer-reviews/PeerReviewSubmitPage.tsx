import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Send, Loader2, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

interface ReviewCycle {
  id: string;
  name: string;
  status: string;
  framework_id?: string | null;
}

interface Nomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  created_at: string;
}

interface Competency {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
}

interface FrameworkWithCompetencies {
  id: string;
  name: string;
  competencies: Competency[];
}

interface PeerCompetencyRating {
  competency_id: string;
  rating: number;
  comments?: string;
}

interface PeerReviewResponse {
  id: string;
  nomination_id: string;
  status: string;
  overall_rating: number | null;
  ratings: PeerCompetencyRating[];
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 disabled:cursor-default"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-gray-200 text-gray-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function PeerReviewSubmitPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [cycleId, setCycleId] = useState("");
  const [nominationId, setNominationId] = useState("");

  const [overallRating, setOverallRating] = useState(0);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");
  const [competencyRatings, setCompetencyRatings] = useState<
    Record<string, { rating: number; comments: string }>
  >({});

  // Cycles I can submit peer reviews for.
  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles", "for-peer-submit"],
    queryFn: () => apiGet<Paginated<ReviewCycle>>("/review-cycles", { page: 1, perPage: 100 }),
  });
  const cycles = (cyclesData?.data?.data ?? []).filter(
    (c) => c.status === "active" || c.status === "draft",
  );

  // My approved nominations for the selected cycle (where I am the nominee/reviewer).
  const { data: nominationsData, isLoading: nomLoading } = useQuery({
    queryKey: ["peer-nominations", "to-submit", cycleId, currentUser?.empcloudUserId],
    enabled: !!cycleId && !!currentUser?.empcloudUserId,
    queryFn: () =>
      apiGet<Paginated<Nomination>>("/peer-reviews/nominations", {
        cycleId,
        nomineeId: currentUser?.empcloudUserId,
        status: "approved",
        perPage: 100,
      }),
  });
  const nominations = nominationsData?.data?.data ?? [];

  const selectedCycle = cycles.find((c) => c.id === cycleId);
  const selectedNomination = nominations.find((n) => n.id === nominationId);

  // Framework competencies for the cycle (optional structured ratings).
  const { data: frameworkData } = useQuery({
    queryKey: ["framework", selectedCycle?.framework_id],
    enabled: Boolean(selectedCycle?.framework_id),
    queryFn: () =>
      apiGet<FrameworkWithCompetencies>(`/competencies/${selectedCycle!.framework_id}`),
  });
  const competencies = frameworkData?.data?.competencies ?? [];

  // Existing response for the selected nomination (so a submitted review is read-only).
  const { data: responseData } = useQuery({
    queryKey: ["peer-review-response", nominationId],
    enabled: Boolean(nominationId),
    queryFn: () => apiGet<PeerReviewResponse | null>(`/peer-reviews/${nominationId}/response`),
  });
  const existingResponse = responseData?.data ?? null;
  const isSubmitted = existingResponse?.status === "submitted";

  // Hydrate the form from an existing response, or reset on nomination change.
  useEffect(() => {
    if (existingResponse) {
      setOverallRating(existingResponse.overall_rating ?? 0);
      setStrengths(existingResponse.strengths ?? "");
      setImprovements(existingResponse.improvements ?? "");
      setComments(existingResponse.comments ?? "");
      const map: Record<string, { rating: number; comments: string }> = {};
      for (const r of existingResponse.ratings ?? []) {
        map[r.competency_id] = { rating: r.rating, comments: r.comments ?? "" };
      }
      setCompetencyRatings(map);
    } else if (nominationId) {
      setOverallRating(0);
      setStrengths("");
      setImprovements("");
      setComments("");
      setCompetencyRatings({});
    }
  }, [existingResponse, nominationId]);

  const submitMutation = useMutation({
    mutationFn: () => {
      const ratings: PeerCompetencyRating[] = Object.entries(competencyRatings)
        .filter(([, cr]) => cr.rating > 0)
        .map(([competency_id, cr]) => ({
          competency_id,
          rating: cr.rating,
          comments: cr.comments || undefined,
        }));
      return apiPost(`/peer-reviews/${nominationId}/submit`, {
        overall_rating: overallRating,
        ratings: ratings.length ? ratings : undefined,
        strengths: strengths || undefined,
        improvements: improvements || undefined,
        comments: comments || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peer-review-response"] });
      queryClient.invalidateQueries({ queryKey: ["peer-nominations"] });
      toast.success("Peer review submitted");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to submit peer review"),
  });

  function setCompetencyRating(competencyId: string, rating: number) {
    setCompetencyRatings((prev) => ({
      ...prev,
      [competencyId]: { rating, comments: prev[competencyId]?.comments ?? "" },
    }));
  }

  function setCompetencyComment(competencyId: string, value: string) {
    setCompetencyRatings((prev) => ({
      ...prev,
      [competencyId]: { rating: prev[competencyId]?.rating ?? 0, comments: value },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nominationId) {
      toast.error("Select a nomination to review");
      return;
    }
    if (overallRating === 0) {
      toast.error("Provide an overall rating");
      return;
    }
    submitMutation.mutate();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submit Peer Review</h1>
          <p className="mt-1 text-sm text-gray-500">
            Complete a peer review for a colleague you were approved to review.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={cycleId}
          onChange={(e) => {
            setCycleId(e.target.value);
            setNominationId("");
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

        {cycleId && (
          <select
            value={nominationId}
            onChange={(e) => setNominationId(e.target.value)}
            disabled={nomLoading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            <option value="">— Select a colleague to review —</option>
            {nominations.map((n) => (
              <option key={n.id} value={n.id}>
                Review of User #{n.employee_id}
              </option>
            ))}
          </select>
        )}
      </div>

      {cycleId && !nomLoading && nominations.length === 0 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ClipboardCheck className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No approved nominations</h3>
          <p className="mt-1 text-sm text-gray-500">
            You have no approved peer reviews to complete in this cycle.
          </p>
        </div>
      )}

      {nomLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      )}

      {selectedNomination && (
        <form onSubmit={handleSubmit} className="mt-8 max-w-3xl space-y-6">
          {isSubmitted && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              This peer review has been submitted and can no longer be edited.
            </div>
          )}

          {competencies.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Competency Ratings</h2>
              <div className="space-y-5">
                {competencies.map((comp) => {
                  const cr = competencyRatings[comp.id];
                  return (
                    <div key={comp.id} className="space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{comp.name}</p>
                          {comp.description && (
                            <p className="text-xs text-gray-500">{comp.description}</p>
                          )}
                          {comp.category && (
                            <span className="inline-flex mt-1 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {comp.category}
                            </span>
                          )}
                        </div>
                        <StarInput
                          value={cr?.rating ?? 0}
                          disabled={isSubmitted}
                          onChange={(r) => setCompetencyRating(comp.id, r)}
                        />
                      </div>
                      <input
                        type="text"
                        value={cr?.comments ?? ""}
                        disabled={isSubmitted}
                        onChange={(e) => setCompetencyComment(comp.id, e.target.value)}
                        placeholder="Add a comment (optional)"
                        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Overall Assessment</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overall Rating <span className="text-red-500">*</span>
              </label>
              <StarInput
                value={overallRating}
                disabled={isSubmitted}
                onChange={setOverallRating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key Strengths</label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                disabled={isSubmitted}
                rows={2}
                placeholder="What are the key strengths demonstrated?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Areas for Improvement
              </label>
              <textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                disabled={isSubmitted}
                rows={2}
                placeholder="What areas need improvement?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Comments
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                disabled={isSubmitted}
                rows={3}
                placeholder="Any other feedback for this colleague..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
              />
            </div>
          </div>

          {!isSubmitted && (
            <button
              type="submit"
              disabled={submitMutation.isPending || overallRating === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {submitMutation.isPending ? "Submitting..." : "Submit Peer Review"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
