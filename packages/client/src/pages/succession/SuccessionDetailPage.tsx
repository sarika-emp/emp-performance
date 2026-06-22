import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  X,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

const NINE_BOX_OPTIONS = [
  "Star",
  "High Performer",
  "Solid Performer",
  "High Potential",
  "Core Player",
  "Average",
  "Inconsistent",
  "Improvement Needed",
  "Action Required",
];

interface SuccessionCandidate {
  id: string;
  plan_id: string;
  employee_id: number;
  readiness: string;
  development_notes: string | null;
  nine_box_position: string | null;
  created_at: string;
}

interface SuccessionPlanDetail {
  id: string;
  organization_id: number;
  position_title: string;
  current_holder_id: number | null;
  department: string | null;
  criticality: string;
  status: string;
  candidates: SuccessionCandidate[];
  created_at: string;
  updated_at: string;
}

const CRITICALITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "bg-blue-100 text-blue-700",
  developing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
};

const READINESS_COLORS: Record<string, string> = {
  ready_now: "bg-green-100 text-green-700",
  "1_2_years": "bg-yellow-100 text-yellow-700",
  "3_5_years": "bg-orange-100 text-orange-700",
};

const READINESS_LABELS: Record<string, string> = {
  ready_now: "Ready Now",
  "1_2_years": "1-2 Years",
  "3_5_years": "3-5 Years",
};

const NINE_BOX_COLORS: Record<string, string> = {
  Star: "bg-green-100 text-green-700",
  "High Performer": "bg-green-50 text-green-600",
  "Solid Performer": "bg-yellow-100 text-yellow-700",
  "High Potential": "bg-blue-100 text-blue-700",
  "Core Player": "bg-yellow-50 text-yellow-600",
  Average: "bg-orange-50 text-orange-600",
  Inconsistent: "bg-amber-100 text-amber-700",
  "Improvement Needed": "bg-orange-100 text-orange-700",
  "Action Required": "bg-red-100 text-red-700",
};

export function SuccessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    position_title: "",
    department: "",
    criticality: "medium",
    status: "identified",
    current_holder_id: "",
  });
  const [candidateForm, setCandidateForm] = useState({
    employee_id: "",
    readiness: "3_5_years",
    development_notes: "",
    nine_box_position: "",
  });

  const { data: planData, isLoading } = useQuery({
    queryKey: ["succession-plan", id],
    queryFn: () => apiGet<SuccessionPlanDetail>(`/succession-plans/${id}`),
    enabled: !!id,
  });

  const plan = planData?.data;

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];
  const userById = new Map<number, OrgUser>(orgUsers.map((u) => [u.id, u]));

  const updatePlanMutation = useMutation({
    mutationFn: (body: any) => apiPut(`/succession-plans/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
      queryClient.invalidateQueries({ queryKey: ["succession-plans"] });
      toast.success("Plan updated");
      setEditPlan(false);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update plan"),
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => apiDelete(`/succession-plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plans"] });
      toast.success("Plan deleted");
      navigate("/succession");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete plan"),
  });

  const addCandidateMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/succession-plans/${id}/candidates`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
      setShowAddCandidate(false);
      setCandidateForm({ employee_id: "", readiness: "3_5_years", development_notes: "", nine_box_position: "" });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to add candidate"),
  });

  const updateCandidateMutation = useMutation({
    mutationFn: ({ candidateId, body }: { candidateId: string; body: any }) =>
      apiPut(`/succession-plans/${id}/candidates/${candidateId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
      setEditingCandidate(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update candidate"),
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (candidateId: string) =>
      apiDelete(`/succession-plans/${id}/candidates/${candidateId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
      toast.success("Candidate removed");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to remove candidate"),
  });

  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    addCandidateMutation.mutate({
      employee_id: Number(candidateForm.employee_id),
      readiness: candidateForm.readiness,
      development_notes: candidateForm.development_notes || undefined,
      nine_box_position: candidateForm.nine_box_position || undefined,
    });
  };

  function startEditPlan() {
    if (!plan) return;
    setPlanForm({
      position_title: plan.position_title,
      department: plan.department ?? "",
      criticality: plan.criticality,
      status: plan.status,
      current_holder_id: plan.current_holder_id ? String(plan.current_holder_id) : "",
    });
    setEditPlan(true);
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Succession plan not found.</p>
        <Link to="/succession" className="mt-4 text-brand-600 hover:underline">
          Back to plans
        </Link>
      </div>
    );
  }

  // Sort candidates by readiness priority
  const readinessOrder: Record<string, number> = { ready_now: 0, "1_2_years": 1, "3_5_years": 2 };
  const sortedCandidates = [...plan.candidates].sort(
    (a, b) => (readinessOrder[a.readiness] ?? 3) - (readinessOrder[b.readiness] ?? 3),
  );

  return (
    <div>
      {/* Header */}
      <Link
        to="/succession"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Succession Plans
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-brand-600" />
            {plan.position_title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {plan.department && (
              <span className="text-sm text-gray-500">{plan.department}</span>
            )}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CRITICALITY_COLORS[plan.criticality]}`}>
              {plan.criticality}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status]}`}>
              {plan.status}
            </span>
          </div>
          {plan.current_holder_id && (
            <p className="mt-1 text-sm text-gray-500">
              Current holder:{" "}
              {userById.get(plan.current_holder_id)?.full_name ||
                `Employee #${plan.current_holder_id}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={startEditPlan}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit Plan
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this succession plan and all its candidates?")) {
                deletePlanMutation.mutate();
              }
            }}
            disabled={deletePlanMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <button
            onClick={() => setShowAddCandidate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      {/* Edit Plan form (S1) */}
      {editPlan && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <h3 className="font-medium text-gray-900">Edit Succession Plan</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Position Title</label>
              <input
                value={planForm.position_title}
                onChange={(e) => setPlanForm((p) => ({ ...p, position_title: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Department</label>
              <input
                value={planForm.department}
                onChange={(e) => setPlanForm((p) => ({ ...p, department: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Criticality</label>
              <select
                value={planForm.criticality}
                onChange={(e) => setPlanForm((p) => ({ ...p, criticality: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={planForm.status}
                onChange={(e) => setPlanForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="identified">Identified</option>
                <option value="developing">Developing</option>
                <option value="ready">Ready</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Holder</label>
              <select
                value={planForm.current_holder_id}
                onChange={(e) => setPlanForm((p) => ({ ...p, current_holder_id: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— None —</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                updatePlanMutation.mutate({
                  position_title: planForm.position_title,
                  department: planForm.department || null,
                  criticality: planForm.criticality,
                  status: planForm.status,
                  current_holder_id: planForm.current_holder_id
                    ? Number(planForm.current_holder_id)
                    : null,
                })
              }
              disabled={!planForm.position_title || updatePlanMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditPlan(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Succession Candidate</h2>
              <button
                onClick={() => setShowAddCandidate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddCandidate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee *
                </label>
                <select
                  value={candidateForm.employee_id}
                  onChange={(e) => setCandidateForm({ ...candidateForm, employee_id: e.target.value })}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Readiness
                </label>
                <select
                  value={candidateForm.readiness}
                  onChange={(e) => setCandidateForm({ ...candidateForm, readiness: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ready_now">Ready Now</option>
                  <option value="1_2_years">1-2 Years</option>
                  <option value="3_5_years">3-5 Years</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  9-Box Position
                </label>
                <select
                  value={candidateForm.nine_box_position}
                  onChange={(e) => setCandidateForm({ ...candidateForm, nine_box_position: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Not assessed</option>
                  <option value="Star">Star</option>
                  <option value="High Performer">High Performer</option>
                  <option value="Solid Performer">Solid Performer</option>
                  <option value="High Potential">High Potential</option>
                  <option value="Core Player">Core Player</option>
                  <option value="Average">Average</option>
                  <option value="Inconsistent">Inconsistent</option>
                  <option value="Improvement Needed">Improvement Needed</option>
                  <option value="Action Required">Action Required</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Development Notes
                </label>
                <textarea
                  value={candidateForm.development_notes}
                  onChange={(e) => setCandidateForm({ ...candidateForm, development_notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Development plan, key skills to build..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCandidate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCandidateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {addCandidateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidates */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-gray-500" />
          Candidates ({plan.candidates.length})
        </h2>

        {sortedCandidates.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No candidates added yet. Click "Add Candidate" to start.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCandidates.map((candidate) => {
              const candUser = userById.get(candidate.employee_id);
              const candName = candUser?.full_name || `Employee #${candidate.employee_id}`;
              if (editingCandidate === candidate.id) {
                return (
                  <CandidateEditForm
                    key={candidate.id}
                    candidate={candidate}
                    name={candName}
                    onCancel={() => setEditingCandidate(null)}
                    onSave={(body) =>
                      updateCandidateMutation.mutate({ candidateId: candidate.id, body })
                    }
                    isPending={updateCandidateMutation.isPending}
                  />
                );
              }
              return (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
                          {candName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{candName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${READINESS_COLORS[candidate.readiness] || "bg-gray-100 text-gray-600"}`}>
                              {READINESS_LABELS[candidate.readiness] || candidate.readiness}
                            </span>
                            {candidate.nine_box_position && (
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${NINE_BOX_COLORS[candidate.nine_box_position] || "bg-gray-100 text-gray-600"}`}>
                                {candidate.nine_box_position}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {candidate.development_notes && (
                        <p className="mt-3 text-sm text-gray-600 ml-13">
                          {candidate.development_notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingCandidate(candidate.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${candName} from this plan?`)) {
                            deleteCandidateMutation.mutate(candidate.id);
                          }
                        }}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// S4: full candidate edit (readiness + nine_box_position + development_notes).
function CandidateEditForm({
  candidate,
  name,
  onCancel,
  onSave,
  isPending,
}: {
  candidate: SuccessionCandidate;
  name: string;
  onCancel: () => void;
  onSave: (body: any) => void;
  isPending: boolean;
}) {
  const [readiness, setReadiness] = useState(candidate.readiness);
  const [nineBox, setNineBox] = useState(candidate.nine_box_position ?? "");
  const [notes, setNotes] = useState(candidate.development_notes ?? "");

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
      <h4 className="text-sm font-medium text-gray-900">Edit {name}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Readiness</label>
          <select
            value={readiness}
            onChange={(e) => setReadiness(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="ready_now">Ready Now</option>
            <option value="1_2_years">1-2 Years</option>
            <option value="3_5_years">3-5 Years</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">9-Box Position</label>
          <select
            value={nineBox}
            onChange={(e) => setNineBox(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Not assessed</option>
            {NINE_BOX_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Development Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSave({
              readiness,
              nine_box_position: nineBox || null,
              development_notes: notes || null,
            })
          }
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
