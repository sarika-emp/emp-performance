import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { FileText, Download, Loader2, Mail, Search } from "lucide-react";
import { apiGet, api } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import { formatDate, cn } from "@/lib/utils";

interface PerformanceLetter {
  id: string;
  type: string;
  content: string;
  sent_at: string | null;
  created_at: string;
  cycle_id: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  appraisal: "Appraisal Letter",
  increment: "Increment Letter",
  promotion: "Promotion Letter",
  confirmation: "Confirmation Letter",
  warning: "Warning Letter",
};

const TYPE_COLORS: Record<string, string> = {
  appraisal: "bg-blue-100 text-blue-800",
  increment: "bg-green-100 text-green-800",
  promotion: "bg-purple-100 text-purple-800",
  confirmation: "bg-teal-100 text-teal-800",
  warning: "bg-red-100 text-red-800",
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS);

async function downloadLetter(letterId: string, type: string) {
  const res = await api.get(`/letters/${letterId}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `letter_${type}_${letterId}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MyLettersPage() {
  const user = getUser();
  const employeeId = user?.empcloudUserId;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-letters", employeeId, page, search, filterType],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceLetter>>("/letters/my", {
        page,
        perPage: 20,
        ...(search && { search }),
        ...(filterType && { type: filterType }),
      }),
    enabled: !!employeeId,
    placeholderData: keepPreviousData,
  });

  const letters = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Letters</h1>
      <p className="mt-1 text-sm text-gray-500">
        View performance letters issued to you.
      </p>

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="relative flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search letter content…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </form>
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Types</option>
          {TYPE_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">Failed to load your letters.</p>
        </div>
      )}

      {!isLoading && !error && letters.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            {search || filterType
              ? "No letters match your filters."
              : "No performance letters have been issued to you yet."}
          </p>
        </div>
      )}

      {letters.length > 0 && (
        <div className="mt-6 space-y-3">
          {letters.map((letter) => (
            <div
              key={letter.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedId(expandedId === letter.id ? null : letter.id)
                }
                className="flex w-full items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {TYPE_LABELS[letter.type] ?? letter.type}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        TYPE_COLORS[letter.type] ?? "bg-gray-100 text-gray-800",
                      )}
                    >
                      {letter.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Issued on {formatDate(letter.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {letter.sent_at && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <Mail className="h-3 w-3" />
                      Sent
                    </span>
                  )}
                </div>
              </button>

              {expandedId === letter.id && (
                <div className="border-t border-gray-100 p-5">
                  {/* L3: render plain-text content safely (no dangerouslySetInnerHTML);
                      whitespace-pre-wrap preserves newlines without an XSS surface. */}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {letter.content}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => downloadLetter(letter.id, letter.type)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
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
