import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Heart,
  Lightbulb,
  Send,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { apiGet, apiDelete } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface FeedbackItem {
  id: string;
  from_user_id: number | null;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | null;
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

const TYPE_ICONS: Record<string, typeof Heart> = {
  kudos: Heart,
  constructive: MessageSquare,
  general: Lightbulb,
};

const TYPE_COLORS: Record<string, string> = {
  kudos: "bg-pink-50 text-pink-600",
  constructive: "bg-blue-50 text-blue-600",
  general: "bg-amber-50 text-amber-600",
};

export function MyFeedbackPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"received" | "given">("received");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const endpoint = tab === "received" ? "/feedback/received" : "/feedback/given";

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", tab, search, page],
    queryFn: () =>
      apiGet<PaginatedFeedback>(endpoint, {
        page,
        perPage: 20,
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

  function switchTab(next: "received" | "given") {
    setTab(next);
    setSearch("");
    setPage(1);
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm({
        title: "Delete feedback?",
        message: "Delete this feedback? This cannot be undone.",
        confirmLabel: "Delete",
        variant: "danger",
      }))
    )
      return;
    deleteMutation.mutate(id);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">Feedback you have received and given.</p>
        </div>
        <Link
          to="/feedback/give"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Send className="h-4 w-4" />
          Give Feedback
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <button
            onClick={() => switchTab("received")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "received"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Received
          </button>
          <button
            onClick={() => switchTab("given")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "given"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Given
          </button>
        </div>
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
      </div>

      {/* List */}
      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No feedback {tab} {search ? "matches your search" : "yet"}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {tab === "received"
              ? "Feedback from colleagues will appear here."
              : "Feedback you give will appear here."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {feedbackList.map((item) => {
            const Icon = TYPE_ICONS[item.type] || MessageSquare;
            const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.constructive;
            const tags: string[] = item.tags
              ? (typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags)
              : [];

            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
                        {item.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        {tab === "received"
                          ? `from ${item.is_anonymous || item.from_user_id == null ? "Anonymous" : `User #${item.from_user_id}`}`
                          : `to User #${item.to_user_id}`}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {formatDate(item.created_at)}
                      </span>
                      {tab === "given" && (
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
