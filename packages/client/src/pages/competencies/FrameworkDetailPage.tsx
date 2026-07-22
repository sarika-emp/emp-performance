import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import type { CompetencyFramework, Competency } from "@emp-performance/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { CompetencyLevelsEditor } from "./CompetencyLevelsEditor";

type FrameworkWithCompetencies = CompetencyFramework & { competencies: Competency[] };

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "", weight: "1", order: "0" });

  const [editFramework, setEditFramework] = useState(false);
  const [fwForm, setFwForm] = useState({ name: "", description: "", is_active: true });
  const [dragId, setDragId] = useState<string | null>(null);
  const [levelsOpenId, setLevelsOpenId] = useState<string | null>(null);

  const { data: fwData, isLoading } = useQuery({
    queryKey: ["framework", id],
    queryFn: () => apiGet<FrameworkWithCompetencies>(`/competencies/${id}`),
    enabled: Boolean(id),
  });

  const framework = fwData?.data;
  const competencies = framework?.competencies ?? [];

  const updateFrameworkMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiPut<CompetencyFramework>(`/competencies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      setEditFramework(false);
      toast.success("Framework updated");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update framework"),
  });

  const deleteFrameworkMutation = useMutation({
    mutationFn: () => apiDelete(`/competencies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework deleted");
      navigate("/competencies");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete framework"),
  });

  const reorderMutation = useMutation({
    mutationFn: (competency_ids: string[]) =>
      apiPut(`/competencies/${id}/competencies/reorder`, { competency_ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to reorder"),
  });

  function startEditFramework() {
    if (!framework) return;
    setFwForm({
      name: framework.name,
      description: framework.description ?? "",
      is_active: framework.is_active,
    });
    setEditFramework(true);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = competencies.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    setDragId(null);
    reorderMutation.mutate(ids);
  }

  const addMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiPost<Competency>(`/competencies/${id}/competencies`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
      setAddMode(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ compId, data }: { compId: string; data: Record<string, any> }) =>
      apiPut<Competency>(`/competencies/${id}/competencies/${compId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
      setEditId(null);
      resetForm();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (compId: string) =>
      apiDelete(`/competencies/${id}/competencies/${compId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
    },
  });

  function resetForm() {
    setForm({ name: "", description: "", category: "", weight: "1", order: "0" });
  }

  function startEdit(comp: Competency) {
    setEditId(comp.id);
    setForm({
      name: comp.name,
      description: comp.description ?? "",
      category: comp.category ?? "",
      weight: String(comp.weight),
      order: String(comp.order),
    });
  }

  function handleSave() {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category || undefined,
      weight: Number(form.weight),
      order: Number(form.order),
    };
    if (editId) {
      updateMutation.mutate({ compId: editId, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  }

  function handleCancel() {
    setAddMode(false);
    setEditId(null);
    resetForm();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!framework) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Framework not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate("/competencies")}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{framework.name}</h1>
            <StatusBadge
              colorClass={
                framework.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }
            >
              {framework.is_active ? "Active" : "Inactive"}
            </StatusBadge>
          </div>
          {framework.description && (
            <p className="mt-1 text-sm text-gray-500">{framework.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startEditFramework}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  "Delete this framework? Competencies will be hidden but historical review ratings are preserved.",
                )
              ) {
                deleteFrameworkMutation.mutate();
              }
            }}
            disabled={deleteFrameworkMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Framework edit form */}
      {editFramework && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Edit Framework</h3>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fwForm.name}
              onChange={(e) => setFwForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={fwForm.description}
              onChange={(e) => setFwForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={fwForm.is_active}
              onChange={(e) => setFwForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Active
          </label>
          <div className="flex gap-2">
            <button
              onClick={() =>
                updateFrameworkMutation.mutate({
                  name: fwForm.name,
                  description: fwForm.description || undefined,
                  is_active: fwForm.is_active,
                })
              }
              disabled={!fwForm.name || updateFrameworkMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={() => setEditFramework(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Competencies */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Competencies ({competencies.length})
          </h2>
          {!addMode && !editId && (
            <button
              onClick={() => setAddMode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              Add Competency
            </button>
          )}
        </div>

        {/* Add/Edit form */}
        {(addMode || editId) && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-900">
              {editId ? "Edit Competency" : "Add Competency"}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. Technical, Leadership"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Weight</label>
                <input
                  type="number"
                  value={form.weight}
                  onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
                  min="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!form.name || addMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {editId ? "Update" : "Add"}
              </button>
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Competency list */}
        {competencies.length === 0 && !addMode ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <p className="text-sm text-gray-500">
              No competencies defined yet. Add your first competency to this framework.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {competencies.map((comp) => (
              <div key={comp.id}>
                <div
                  draggable
                  onDragStart={() => setDragId(comp.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(comp.id)}
                  className={`flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-colors ${
                    dragId === comp.id ? "border-brand-300 opacity-60" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0 cursor-grab" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{comp.name}</span>
                      {comp.category && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {comp.category}
                        </span>
                      )}
                    </div>
                    {comp.description && (
                      <p className="mt-0.5 text-xs text-gray-500 truncate">{comp.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    Weight: {comp.weight}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() =>
                        setLevelsOpenId((cur) => (cur === comp.id ? null : comp.id))
                      }
                      className="inline-flex items-center gap-1 rounded p-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      {levelsOpenId === comp.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Levels
                    </button>
                    <button
                      onClick={() => startEdit(comp)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Remove competency "${comp.name}"? Historical review ratings are preserved.`,
                          )
                        ) {
                          removeMutation.mutate(comp.id);
                        }
                      }}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {levelsOpenId === comp.id && <CompetencyLevelsEditor competencyId={comp.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
