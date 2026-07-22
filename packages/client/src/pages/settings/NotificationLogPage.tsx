import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiGet } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/Pagination";

interface LogEntry {
  id: string;
  channel: string;
  category: string;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

interface PaginatedLog {
  data: LogEntry[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const STATUSES = ["", "sent", "failed"] as const;

export function NotificationLogPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notification-log", page, status],
    queryFn: () =>
      apiGet<PaginatedLog>("/notifications/log", {
        page,
        perPage: 20,
        status: status || undefined,
      }),
  });

  const rows = data?.data?.data ?? [];
  const pager = data?.data;

  return (
    <div>
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Log</h1>
          <p className="mt-1 text-sm text-gray-500">Outbound email and reminder delivery history.</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              status === s
                ? "bg-brand-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : isError ? (
          <p className="px-6 py-12 text-center text-sm text-red-500">Failed to load delivery log.</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">No delivery records yet.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    {r.status === "sent" ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Sent
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-red-600"
                        title={r.error || undefined}
                      >
                        <XCircle className="h-4 w-4" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.category}</td>
                  <td className="px-4 py-3 text-gray-700">{r.recipient || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.subject || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
