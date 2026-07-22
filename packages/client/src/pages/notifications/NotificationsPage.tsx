import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/Pagination";
import toast from "react-hot-toast";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface PaginatedNotifications {
  data: NotificationItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", "feed", page, unreadOnly],
    queryFn: () =>
      apiGet<PaginatedNotifications>("/notifications/feed", {
        page,
        perPage: 20,
        unreadOnly: unreadOnly ? "true" : undefined,
      }),
  });

  const items = data?.data?.data ?? [];
  const pager = data?.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => apiPost("/notifications/read-all"),
    onSuccess: () => {
      toast.success("All notifications marked as read");
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/notifications/${id}`),
    onSuccess: invalidate,
  });

  function handleOpen(n: NotificationItem) {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="mt-1 text-sm text-gray-500">Your performance activity and reminders.</p>
          </div>
        </div>
        <button
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Mark all read
        </button>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <FilterButton label="All" active={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(1); }} />
        <FilterButton label="Unread" active={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(1); }} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : isError ? (
          <p className="px-6 py-12 text-center text-sm text-red-500">Failed to load notifications.</p>
        ) : items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">No notifications.</p>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 border-b border-gray-50 px-6 py-4 last:border-b-0",
                !n.is_read && "bg-brand-50/40",
              )}
            >
              <div className="flex-1">
                <button onClick={() => handleOpen(n)} className="text-left">
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-gray-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-gray-400">{formatDate(n.created_at)}</p>
                </button>
              </div>
              <div className="flex items-center gap-1">
                {!n.is_read && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                    title="Mark as read"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => remove.mutate(n.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {pager && (
        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          onPageChange={setPage}
          className="mt-4"
        />
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
      )}
    >
      {label}
    </button>
  );
}
