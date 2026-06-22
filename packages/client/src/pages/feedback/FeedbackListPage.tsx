import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Heart,
  MessageSquare,
  Lightbulb,
  Loader2,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { apiGet, apiDelete } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

interface FeedbackItem {
  id: string;
  from_user_id: number | null;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | string[] | null;
  is_anonymous: boolean;
  created_at: string;
}

interface PaginatedFeedback {
  data: FeedbackItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const ADMIN_ROLES = new Set(["super_admin", "org_admin", "hr_admin", "hr_manager"]);

const TYPE_CONFIG: Record<string, { icon: typeof Heart; color: string; label: string }> = {
  kudos: { icon: Heart, color: "bg-pink-50 text-pink-600", label: "Kudos" },
  constructive: { icon: MessageSquare, color: "bg-blue-50 text-blue-600", label: "Constructive" },
  general: { icon: Lightbulb, color: "bg-amber-50 text-amber-600", label: "General" },
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  manager_visible: "Manager Only",
  private: "Private",
};

function parseTags(tags: string | string[] | null): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

export function FeedbackListPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const canManageAny = ADMIN_ROLES.has(currentUser?.role ?? "");

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", "all", typeFilter, search, page],
    queryFn: () =>
      apiGet<PaginatedFeedback>("/feedback", {
        page,
        perPage: 20,
        ...(typeFilter !== "all" && { type: typeFilter }),
        ...(search && { search }),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/feedback/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Feedback deleted");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete feedback"),
  });

  const feedbackList = data?.data?.data ?? [];
  const pagination = data?.data;

  function handleDelete(id: string) {
    if (!window.confirm("Delete this feedback? This cannot be undone.")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all feedback across the organization.
          </p>
        </div>
        <Link
          to="/feedback/give"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Send className="h-4 w-4" />
          Give Feedback
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {[
            { key: "all", label: "All" },
            { key: "kudos", label: "Kudos" },
            { key: "constructive", label: "Constructive" },
            { key: "general", label: "General" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setTypeFilter(tab.key);
                setPage(1);
              }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback List */}
      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No feedback found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {feedbackList.map((item) => {
            const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.kudos;
            const Icon = cfg.icon;
            const tags = parseTags(item.tags);
            const canDelete = canManageAny || item.from_user_id === currentUser?.empcloudUserId;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {item.is_anonymous || item.from_user_id == null
                          ? "Anonymous"
                          : `User #${item.from_user_id}`}
                      </span>
                      <span className="text-gray-300">-&gt;</span>
                      <span className="text-sm font-medium text-gray-900">
                        User #{item.to_user_id}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {VISIBILITY_LABELS[item.visibility] || item.visibility}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {formatDate(item.created_at)}
                      </span>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deleteMutation.isPending}
                          className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Delete feedback"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{item.message}</p>
                    {tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
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
