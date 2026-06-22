import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import type { CompetencyLevel } from "@emp-performance/shared";

type LevelForm = {
  level: string;
  name: string;
  description: string;
  sort_order: string;
  anchors: string; // newline-separated, one anchor per line
};

const EMPTY_FORM: LevelForm = {
  level: "1",
  name: "",
  description: "",
  sort_order: "",
  anchors: "",
};

function anchorsToText(anchors: string[] | null): string {
  return (anchors ?? []).join("\n");
}

function textToAnchors(text: string): string[] {
  return text
    .split("\n")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

export function CompetencyLevelsEditor({ competencyId }: { competencyId: string }) {
  const queryClient = useQueryClient();
  const [addMode, setAddMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LevelForm>(EMPTY_FORM);

  const queryKey = ["competency-levels", competencyId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<CompetencyLevel[]>(`/competencies/${competencyId}/levels`),
    enabled: Boolean(competencyId),
  });

  const levels = data?.data ?? [];

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function handleCancel() {
    setAddMode(false);
    setEditId(null);
    resetForm();
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiPost<CompetencyLevel>(`/competencies/${competencyId}/levels`, body),
    onSuccess: () => {
      invalidate();
      setAddMode(false);
      resetForm();
      toast.success("Level added");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to add level"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ levelId, body }: { levelId: string; body: Record<string, any> }) =>
      apiPut<CompetencyLevel>(`/competencies/${competencyId}/levels/${levelId}`, body),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      resetForm();
      toast.success("Level updated");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update level"),
  });

  const deleteMutation = useMutation({
    mutationFn: (levelId: string) =>
      apiDelete(`/competencies/${competencyId}/levels/${levelId}`),
    onSuccess: () => {
      invalidate();
      toast.success("Level deleted");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete level"),
  });

  function startAdd() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, level: String((levels[levels.length - 1]?.level ?? 0) + 1) });
    setAddMode(true);
  }

  function startEdit(lvl: CompetencyLevel) {
    setAddMode(false);
    setEditId(lvl.id);
    setForm({
      level: String(lvl.level),
      name: lvl.name,
      description: lvl.description ?? "",
      sort_order: lvl.sort_order != null ? String(lvl.sort_order) : "",
      anchors: anchorsToText(lvl.behavioral_anchors),
    });
  }

  function handleSave() {
    const body: Record<string, any> = {
      level: Number(form.level),
      name: form.name,
      description: form.description || undefined,
      behavioral_anchors: textToAnchors(form.anchors),
    };
    if (form.sort_order !== "") body.sort_order = Number(form.sort_order);

    if (editId) {
      updateMutation.mutate({ levelId: editId, body });
    } else {
      addMutation.mutate(body);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Proficiency Levels ({levels.length})
        </h4>
        {!addMode && !editId && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Level
          </button>
        )}
      </div>

      {(addMode || editId) && (
        <div className="space-y-2 rounded-md border border-brand-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Level # <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.level}
                onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Beginner, Proficient, Expert"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Behavioral Anchors{" "}
              <span className="font-normal text-gray-400">(one per line)</span>
            </label>
            <textarea
              value={form.anchors}
              onChange={(e) => setForm((p) => ({ ...p, anchors: e.target.value }))}
              rows={3}
              placeholder={"Demonstrates X consistently\nCoaches others on Y"}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={
                !form.name ||
                !form.level ||
                addMutation.isPending ||
                updateMutation.isPending
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {editId ? "Update" : "Add"}
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-gray-400">Loading levels…</p>
      ) : levels.length === 0 && !addMode ? (
        <p className="text-xs text-gray-400">No proficiency levels defined yet.</p>
      ) : (
        <div className="space-y-1.5">
          {levels.map((lvl) => (
            <div
              key={lvl.id}
              className="rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-100 px-1 text-xs font-semibold text-brand-700">
                  {lvl.level}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{lvl.name}</span>
                  {lvl.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{lvl.description}</p>
                  )}
                  {lvl.behavioral_anchors && lvl.behavioral_anchors.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-500">
                      {lvl.behavioral_anchors.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <button
                    onClick={() => startEdit(lvl)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete level "${lvl.name}"?`)) {
                        deleteMutation.mutate(lvl.id);
                      }
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
