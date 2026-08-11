import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Download, Loader2, Mail, Search } from "lucide-react";
import { apiGet, api } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";

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

const TYPE_LABEL_KEYS: Record<string, string> = {
  appraisal: "myLetters.types.appraisal",
  increment: "myLetters.types.increment",
  promotion: "myLetters.types.promotion",
  confirmation: "myLetters.types.confirmation",
  warning: "myLetters.types.warning",
};

const TYPE_COLORS: Record<string, string> = {
  appraisal: "bg-blue-100 text-blue-800",
  increment: "bg-green-100 text-green-800",
  promotion: "bg-purple-100 text-purple-800",
  confirmation: "bg-teal-100 text-teal-800",
  warning: "bg-red-100 text-red-800",
};

const TYPE_OPTIONS = Object.keys(TYPE_LABEL_KEYS);

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
  const { t, i18n } = useTranslation();
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
      <h1 className="text-2xl font-bold text-gray-900">{t("myLetters.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {t("myLetters.subtitle")}
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
            placeholder={t("myLetters.searchPlaceholder")}
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
          <option value="">{t("myLetters.allTypes")}</option>
          {TYPE_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {t(TYPE_LABEL_KEYS[key])}
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
          <p className="text-sm text-red-600">{t("myLetters.loadError")}</p>
        </div>
      )}

      {!isLoading && !error && letters.length === 0 && (
        <EmptyState
          icon={FileText}
          title={
            search || filterType
              ? t("myLetters.emptyFiltered")
              : t("myLetters.empty")
          }
        />
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
                      {TYPE_LABEL_KEYS[letter.type] ? t(TYPE_LABEL_KEYS[letter.type]) : letter.type}
                    </span>
                    <StatusBadge
                      colorClass={TYPE_COLORS[letter.type] ?? "bg-gray-100 text-gray-800"}
                      className="px-2"
                    >
                      {TYPE_LABEL_KEYS[letter.type] ? t(TYPE_LABEL_KEYS[letter.type]) : letter.type}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t("myLetters.issuedOn", {
                      date: formatDate(letter.created_at, i18n.resolvedLanguage),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {letter.sent_at && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <Mail className="h-3 w-3" />
                      {t("myLetters.sent")}
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
                      {t("myLetters.download")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
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
