import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Heart, MessageSquare, Lightbulb, Loader2, Search, Send } from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";

interface FeedbackItem {
  id: string;
  from_user_id: number | null;
  from_user_name: string | null;
  to_user_id: number;
  to_user_name: string | null;
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

const TYPE_CONFIG: Record<string, { icon: typeof Heart; color: string; label: string }> = {
  kudos: { icon: Heart, color: "bg-pink-50 text-pink-600", label: "Kudos" },
  constructive: { icon: MessageSquare, color: "bg-blue-50 text-blue-600", label: "Constructive" },
  general: { icon: Lightbulb, color: "bg-amber-50 text-amber-600", label: "General" },
};

function parseTags(tags: string | string[] | null): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

export function KudosWallPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", "wall", search, page],
    queryFn: () =>
      apiGet<PaginatedFeedback>("/feedback/wall", {
        page,
        perPage: 20,
        ...(search && { search }),
      }),
  });

  const wall = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kudos Wall</h1>
          <p className="mt-1 text-sm text-gray-500">
            Celebrate the great work happening across the organization.
          </p>
        </div>
        <Link
          to="/feedback/give"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Send className="h-4 w-4" />
          Give Kudos
        </Link>
      </div>

      <div className="mt-6">
        <div className="relative w-fit">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search the wall..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : wall.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="The wall is empty"
          description="Public feedback and kudos will show up here."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {wall.map((item) => {
            const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.kudos;
            const Icon = cfg.icon;
            const tags = parseTags(item.tags);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <StatusBadge colorClass={cfg.color} className="px-2">
                    {cfg.label}
                  </StatusBadge>
                  <span className="ml-auto text-xs text-gray-400">
                    {formatDate(item.created_at)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-700">{item.message}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {item.is_anonymous || item.from_user_id == null
                      ? "Anonymous"
                      : item.from_user_name || `User #${item.from_user_id}`}
                  </span>
                  <span className="text-gray-300">-&gt;</span>
                  <span className="font-medium text-gray-700">
                    {item.to_user_name || `User #${item.to_user_id}`}
                  </span>
                </div>
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
            );
          })}
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
