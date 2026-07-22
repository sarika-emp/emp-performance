import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  X,
  Check,
  Search,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type {
  PerformanceLetterTemplate,
  LetterType,
  PaginatedResponse,
} from "@emp-performance/shared";

const LETTER_TYPES: { key: LetterType; label: string; color: string }[] = [
  { key: "appraisal", label: "Appraisal", color: "bg-blue-100 text-blue-700" },
  { key: "increment", label: "Increment", color: "bg-green-100 text-green-700" },
  { key: "promotion", label: "Promotion", color: "bg-purple-100 text-purple-700" },
  { key: "confirmation", label: "Confirmation", color: "bg-amber-100 text-amber-700" },
  { key: "warning", label: "Warning", color: "bg-red-100 text-red-700" },
];

function getTypeColor(type: string) {
  return LETTER_TYPES.find((t) => t.key === type)?.color ?? "bg-gray-100 text-gray-700";
}

function getTypeLabel(type: string) {
  return LETTER_TYPES.find((t) => t.key === type)?.label ?? type;
}

interface TemplateFormData {
  name: string;
  type: LetterType;
  content_template: string;
  is_default: boolean;
}

function TemplateForm({
  initial,
  onSave,
  onPreview,
  onCancel,
  saving,
}: {
  initial?: Partial<TemplateFormData>;
  onSave: (data: TemplateFormData) => void;
  onPreview: (content: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<LetterType>(initial?.type ?? "appraisal");
  const [content, setContent] = useState(initial?.content_template ?? "");
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, type, content_template: content, is_default: isDefault });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="e.g., Annual Appraisal Letter"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Letter Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LetterType)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {LETTER_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Template Content (Handlebars)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Available variables: {"{{employee_name}}"}, {"{{designation}}"}, {"{{manager_name}}"}, {"{{organization_name}}"}, {"{{date}}"}, {"{{overall_rating}}"}, {"{{review_summary}}"}, {"{{strengths}}"}, {"{{improvements}}"}
        </p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={12}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder={`Dear {{employee_name}},\n\nWe are pleased to inform you about your performance review...\n\nOverall Rating: {{overall_rating}}\n\nStrengths:\n{{strengths}}\n\nAreas for Improvement:\n{{improvements}}\n\nDate: {{date}}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_default"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="is_default" className="text-sm text-gray-700">
          Set as default template for this type
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onPreview(content)}
          disabled={!content}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>
        <button
          type="submit"
          disabled={saving || !name || !content}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Update" : "Create"} Template
        </button>
      </div>
    </form>
  );
}

export function LetterTemplatePage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PerformanceLetterTemplate | null>(null);
  const [filterType, setFilterType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["letter-templates", filterType, search, page],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceLetterTemplate>>("/letters/templates", {
        page,
        perPage: 20,
        ...(filterType && { type: filterType }),
        ...(search && { search }),
      }),
    placeholderData: keepPreviousData,
  });

  const templates = data?.data?.data ?? [];
  const pagination = data?.data;

  const previewMutation = useMutation({
    mutationFn: (content_template: string) =>
      apiPost<{ content: string }>("/letters/templates/preview", { content_template }),
    onSuccess: (res) => {
      setPreview(res.data?.content ?? "");
    },
  });

  const createMutation = useMutation({
    mutationFn: (formData: TemplateFormData) => apiPost("/letters/templates", formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letter-templates"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TemplateFormData> }) =>
      apiPut(`/letters/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letter-templates"] });
      setEditingTemplate(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/letters/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letter-templates"] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Letter Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage performance letter templates for appraisals, increments, and more.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
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
            placeholder="Search by name or content…"
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
          {LETTER_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Preview modal (L8) */}
      {preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setPreview(null)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Template Preview</h2>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {preview || "(empty)"}
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Variables are shown as placeholders here; real employee values are filled in when a
              letter is generated.
            </p>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {(showForm || editingTemplate) && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingTemplate ? "Edit Template" : "New Template"}
          </h2>
          <TemplateForm
            initial={
              editingTemplate
                ? {
                    name: editingTemplate.name,
                    type: editingTemplate.type,
                    content_template: editingTemplate.content_template,
                    is_default: editingTemplate.is_default,
                  }
                : undefined
            }
            onSave={(formData) => {
              if (editingTemplate) {
                updateMutation.mutate({ id: editingTemplate.id, data: formData });
              } else {
                createMutation.mutate(formData);
              }
            }}
            onPreview={(content) => previewMutation.mutate(content)}
            onCancel={() => {
              setShowForm(false);
              setEditingTemplate(null);
            }}
            saving={createMutation.isPending || updateMutation.isPending}
          />
        </div>
      )}

      {/* Templates List */}
      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        )}

        {!isLoading && templates.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No templates found. Create your first letter template."
            className=""
          />
        )}

        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
                  <StatusBadge colorClass={getTypeColor(template.type)} className="px-2">
                    {getTypeLabel(template.type)}
                  </StatusBadge>
                  {template.is_default && (
                    <StatusBadge colorClass="bg-brand-50 text-brand-700" className="px-2" icon={<Check className="h-3 w-3" />}>
                      Default
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Created {formatDate(template.created_at)}
                </p>
                <pre className="mt-2 max-h-20 overflow-hidden text-xs text-gray-500 whitespace-pre-wrap font-mono bg-gray-50 rounded p-2">
                  {template.content_template.slice(0, 200)}
                  {template.content_template.length > 200 ? "..." : ""}
                </pre>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => previewMutation.mutate(template.content_template)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingTemplate(template);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete template?",
                        message: "Delete this template? Issued letters will be preserved.",
                        confirmLabel: "Delete",
                        variant: "danger",
                      })
                    ) {
                      deleteMutation.mutate(template.id);
                    }
                  }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
