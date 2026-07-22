import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  FileText,
  Send,
  Download,
  Loader2,
  Plus,
  Eye,
  X,
  Mail,
  Settings,
  Search,
  RefreshCw,
  Ban,
} from "lucide-react";
import { apiGet, apiPost, api } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type {
  GeneratedPerformanceLetter,
  PerformanceLetterTemplate,
  PaginatedResponse,
  ReviewCycle,
} from "@emp-performance/shared";

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

const TYPE_COLORS: Record<string, string> = {
  appraisal: "bg-blue-100 text-blue-700",
  increment: "bg-green-100 text-green-700",
  promotion: "bg-purple-100 text-purple-700",
  confirmation: "bg-amber-100 text-amber-700",
  warning: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  appraisal: "Appraisal",
  increment: "Increment",
  promotion: "Promotion",
  confirmation: "Confirmation",
  warning: "Warning",
};

async function downloadLetter(letter: GeneratedPerformanceLetter) {
  const res = await api.get(`/letters/${letter.id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `letter_${letter.type}_employee_${letter.employee_id}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GeneratedLettersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewingLetter, setViewingLetter] = useState<GeneratedPerformanceLetter | null>(null);

  // Generate form state
  const [genEmployeeId, setGenEmployeeId] = useState("");
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genCycleId, setGenCycleId] = useState("");
  const [genTypeFilter, setGenTypeFilter] = useState("");

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles", "letters-picker"],
    queryFn: () => apiGet<PaginatedResponse<ReviewCycle>>("/review-cycles", { perPage: 100 }),
  });
  const cycles: ReviewCycle[] = cyclesData?.data?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["generated-letters", page, filterType, filterStatus, search],
    queryFn: () =>
      apiGet<PaginatedResponse<GeneratedPerformanceLetter>>("/letters", {
        page,
        perPage: 20,
        ...(filterType && { type: filterType }),
        ...(filterStatus && { status: filterStatus }),
        ...(search && { search }),
      }),
    placeholderData: keepPreviousData,
  });

  const letters = data?.data?.data ?? [];
  const pagination = data?.data;

  const { data: templatesData } = useQuery({
    queryKey: ["letter-templates-all"],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceLetterTemplate>>("/letters/templates", {
        perPage: 100,
      }),
  });

  const templates = templatesData?.data?.data ?? [];

  // When generating, narrow the template dropdown by letter type so the
  // user picks a template that matches the letter they intend to send (#20).
  const visibleTemplates = useMemo(() => {
    if (!genTypeFilter) return templates;
    return templates.filter((t) => t.type === genTypeFilter);
  }, [templates, genTypeFilter]);

  // L6: pre-select the default template for the chosen type when available.
  useEffect(() => {
    if (genTemplateId) return;
    const def = visibleTemplates.find((t) => t.is_default);
    if (def) setGenTemplateId(def.id);
  }, [visibleTemplates, genTemplateId]);

  const generateMutation = useMutation({
    mutationFn: (body: { employee_id: number; template_id: string; cycle_id?: string }) =>
      apiPost<GeneratedPerformanceLetter>("/letters/generate", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
      setShowGenerate(false);
      setGenEmployeeId("");
      setGenTemplateId("");
      setGenCycleId("");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (letterId: string) => apiPost(`/letters/${letterId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (letterId: string) => apiPost(`/letters/${letterId}/regenerate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (letterId: string) => apiPost(`/letters/${letterId}/void`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
      setViewingLetter(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generated Letters</h1>
          <p className="mt-1 text-sm text-gray-500">
            View, download, and send performance letters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/letter-templates"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Manage Templates
          </Link>
          <button
            onClick={() => setShowGenerate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Generate Letter
          </button>
        </div>
      </div>

      {/* Filters */}
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
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {/* Generate Form */}
      {showGenerate && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate Letter</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generateMutation.mutate({
                employee_id: Number(genEmployeeId),
                template_id: genTemplateId,
                ...(genCycleId && { cycle_id: genCycleId }),
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee <span className="text-red-500">*</span>
              </label>
              <select
                value={genEmployeeId}
                onChange={(e) => setGenEmployeeId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Select an employee —</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Letter Type
                </label>
                <select
                  value={genTypeFilter}
                  onChange={(e) => {
                    setGenTypeFilter(e.target.value);
                    setGenTemplateId("");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All types</option>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template <span className="text-red-500">*</span>
                </label>
                <select
                  value={genTemplateId}
                  onChange={(e) => setGenTemplateId(e.target.value)}
                  required
                  disabled={visibleTemplates.length === 0}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                >
                  <option value="">
                    {visibleTemplates.length === 0
                      ? genTypeFilter
                        ? `No ${TYPE_LABELS[genTypeFilter] ?? genTypeFilter} templates yet`
                        : "No templates yet"
                      : "— Select a template —"}
                  </option>
                  {visibleTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({TYPE_LABELS[t.type] ?? t.type})
                      {t.is_default ? " · default" : ""}
                    </option>
                  ))}
                </select>
                {visibleTemplates.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    <Link
                      to="/letter-templates"
                      className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
                    >
                      <Settings className="h-3 w-3" />
                      Manage templates
                    </Link>{" "}
                    to add one before generating.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Review Cycle (optional)
              </label>
              <select
                value={genCycleId}
                onChange={(e) => setGenCycleId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— No cycle —</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generateMutation.isPending || !genEmployeeId || !genTemplateId}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Letter Preview Modal */}
      {viewingLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setViewingLetter(null)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Letter Preview</h2>
            <div className="flex items-center gap-2 mb-4">
              <StatusBadge
                colorClass={TYPE_COLORS[viewingLetter.type] ?? "bg-gray-100 text-gray-700"}
                className="px-2"
              >
                {TYPE_LABELS[viewingLetter.type] ?? viewingLetter.type}
              </StatusBadge>
              <span className="text-xs text-gray-400">
                Employee #{viewingLetter.employee_id}
              </span>
              <span className="text-xs text-gray-400">
                Generated {formatDate(viewingLetter.created_at)}
              </span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                {viewingLetter.content}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => downloadLetter(viewingLetter)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              {!viewingLetter.sent_at && !viewingLetter.voided_at && (
                <button
                  onClick={() => regenerateMutation.mutate(viewingLetter.id)}
                  disabled={regenerateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </button>
              )}
              {!viewingLetter.voided_at && (
                <button
                  onClick={() => {
                    if (confirm("Void this letter? This cannot be undone.")) {
                      voidMutation.mutate(viewingLetter.id);
                    }
                  }}
                  disabled={voidMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" />
                  Void
                </button>
              )}
              {!viewingLetter.sent_at && !viewingLetter.voided_at && (
                <button
                  onClick={() => {
                    sendMutation.mutate(viewingLetter.id);
                    setViewingLetter(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Letters List */}
      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        )}

        {!isLoading && letters.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No generated letters yet. Generate your first letter using a template."
            className=""
          />
        )}

        {letters.map((letter) => (
          <div
            key={letter.id}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    colorClass={TYPE_COLORS[letter.type] ?? "bg-gray-100 text-gray-700"}
                    className="px-2"
                  >
                    {TYPE_LABELS[letter.type] ?? letter.type}
                  </StatusBadge>
                  <span className="text-sm font-medium text-gray-900">
                    Employee #{letter.employee_id}
                  </span>
                  {letter.voided_at ? (
                    <StatusBadge colorClass="bg-gray-100 text-gray-600" className="px-2" icon={<Ban className="h-3 w-3" />}>
                      Voided
                    </StatusBadge>
                  ) : letter.sent_at ? (
                    <StatusBadge colorClass="bg-green-50 text-green-700" className="px-2" icon={<Mail className="h-3 w-3" />}>
                      Sent {formatDate(letter.sent_at)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge colorClass="bg-yellow-50 text-yellow-700" className="px-2">
                      Draft
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Generated {formatDate(letter.created_at)} by user #{letter.generated_by}
                  {letter.cycle_id && ` | Cycle: ${letter.cycle_id.slice(0, 8)}...`}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => setViewingLetter(letter)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => downloadLetter(letter)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                {!letter.sent_at && !letter.voided_at && (
                  <button
                    onClick={() => sendMutation.mutate(letter.id)}
                    disabled={sendMutation.isPending}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                    title="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

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
