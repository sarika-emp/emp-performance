import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Grid3X3, ChevronDown, X, Users, Plus, Trash2, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost, apiDelete } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import type { NineBoxPosition } from "@emp-performance/shared";

interface OrgUser {
  id: number;
  full_name: string;
}

interface PotentialAssessment {
  id: string;
  employee_id: number;
  potential_rating: number;
  notes: string | null;
  employee_name?: string;
}

interface NineBoxEmployee {
  id: number;
  name: string;
  department: string | null;
  rating: number;
  potential: number;
}

interface NineBoxCell {
  employees: NineBoxEmployee[];
  count: number;
}

interface NineBoxData {
  boxes: Record<NineBoxPosition, NineBoxCell>;
  totalEmployees: number;
}

interface ReviewCycle {
  id: string;
  name: string;
  status: string;
}

// Grid layout: rows = potential (high to low top-to-bottom), cols = performance (low to high left-to-right)
const GRID_LAYOUT: { row: number; col: number; name: NineBoxPosition; color: string; bgColor: string }[] = [
  // Row 0: High Potential
  { row: 0, col: 0, name: "Inconsistent", color: "border-amber-400", bgColor: "bg-amber-50 hover:bg-amber-100" },
  { row: 0, col: 1, name: "High Potential", color: "border-blue-400", bgColor: "bg-blue-50 hover:bg-blue-100" },
  { row: 0, col: 2, name: "Star", color: "border-green-500", bgColor: "bg-green-50 hover:bg-green-100" },
  // Row 1: Medium Potential
  { row: 1, col: 0, name: "Improvement Needed", color: "border-orange-400", bgColor: "bg-orange-50 hover:bg-orange-100" },
  { row: 1, col: 1, name: "Core Player", color: "border-yellow-400", bgColor: "bg-yellow-50 hover:bg-yellow-100" },
  { row: 1, col: 2, name: "High Performer", color: "border-green-400", bgColor: "bg-green-50 hover:bg-green-100" },
  // Row 2: Low Potential
  { row: 2, col: 0, name: "Action Required", color: "border-red-500", bgColor: "bg-red-50 hover:bg-red-100" },
  { row: 2, col: 1, name: "Average", color: "border-orange-300", bgColor: "bg-orange-50 hover:bg-orange-100" },
  { row: 2, col: 2, name: "Solid Performer", color: "border-yellow-400", bgColor: "bg-yellow-50 hover:bg-yellow-100" },
];

const POTENTIAL_LABELS = ["High Potential", "Medium Potential", "Low Potential"];
const PERFORMANCE_LABELS = ["Low Performance", "Medium Performance", "High Performance"];

export function NineBoxPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedBox, setSelectedBox] = useState<NineBoxPosition | null>(null);

  // A5: potential-assessment form state
  const [formEmployeeId, setFormEmployeeId] = useState<string>("");
  const [formRating, setFormRating] = useState<number>(3);
  const [formNotes, setFormNotes] = useState<string>("");

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles-list"],
    queryFn: () =>
      apiGet<{ data: ReviewCycle[]; total: number }>("/review-cycles", {
        perPage: 100,
        status: "completed",
      }),
  });

  const cycles = cyclesData?.data?.data || [];

  // Wait for the user to pick a cycle — auto-selecting the most recent
  // one was misleading, since the page presented data without the user
  // realising it (#23).
  const activeCycleId = selectedCycleId;

  const { data: nineBoxData, isLoading } = useQuery({
    queryKey: ["nine-box", activeCycleId],
    queryFn: () => apiGet<NineBoxData>("/analytics/nine-box", { cycleId: activeCycleId }),
    enabled: !!activeCycleId,
  });

  const boxes = nineBoxData?.data?.boxes;
  const totalEmployees = nineBoxData?.data?.totalEmployees ?? 0;

  const selectedBoxData = selectedBox && boxes ? boxes[selectedBox] : null;

  // A5: org users for the employee picker
  const { data: usersData } = useQuery({
    queryKey: ["org-users-picker"],
    queryFn: () => apiGet<OrgUser[]>("/users", { limit: 500 }),
    enabled: !!activeCycleId,
  });
  const orgUsers = usersData?.data || [];

  // A5: existing potential assessments for the cycle
  const { data: assessmentsData } = useQuery({
    queryKey: ["potential-assessments", activeCycleId],
    queryFn: () =>
      apiGet<PotentialAssessment[]>("/analytics/potential-assessments", { cycleId: activeCycleId }),
    enabled: !!activeCycleId,
  });
  const assessments = assessmentsData?.data || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["potential-assessments", activeCycleId] });
    queryClient.invalidateQueries({ queryKey: ["nine-box", activeCycleId] });
  };

  const saveMutation = useMutation({
    mutationFn: (body: { cycle_id: string; employee_id: number; potential_rating: number; notes?: string }) =>
      apiPost("/analytics/potential-assessments", body),
    onSuccess: () => {
      toast.success("Potential assessment saved");
      setFormEmployeeId("");
      setFormRating(3);
      setFormNotes("");
      invalidate();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to save assessment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/analytics/potential-assessments/${id}`),
    onSuccess: () => {
      toast.success("Assessment removed");
      invalidate();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to remove assessment"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployeeId) {
      toast.error("Select an employee");
      return;
    }
    saveMutation.mutate({
      cycle_id: activeCycleId,
      employee_id: Number(formEmployeeId),
      potential_rating: formRating,
      notes: formNotes.trim() || undefined,
    });
  };

  const startEdit = (a: PotentialAssessment) => {
    setFormEmployeeId(String(a.employee_id));
    setFormRating(a.potential_rating);
    setFormNotes(a.notes || "");
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Grid3X3 className="h-7 w-7 text-brand-600" />
            9-Box Grid
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Performance vs Potential talent matrix. {totalEmployees > 0 && `${totalEmployees} employees mapped.`}
          </p>
        </div>

        {/* Cycle Selector */}
        <div className="relative">
          <select
            value={activeCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-gray-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Select cycle...</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {!activeCycleId ? (
        <div className="mt-12 flex flex-col items-center justify-center text-gray-400">
          <Grid3X3 className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">Select a completed review cycle</p>
          <p className="text-sm">The 9-box grid requires performance ratings and potential assessments.</p>
        </div>
      ) : isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="mt-6">
          {/* Grid */}
          <div className="flex items-stretch gap-3">
            {/* Y-axis: vertical "Potential" title + per-row labels */}
            <div className="flex shrink-0 items-stretch gap-2">
              <div className="flex items-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                  Potential &uarr;
                </span>
              </div>
              <div className="flex w-24 flex-col">
                {POTENTIAL_LABELS.map((label) => (
                  <div
                    key={label}
                    className="flex flex-1 items-center justify-end pr-2 text-right"
                  >
                    <span className="text-xs font-medium text-gray-500 leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {/* The 3x3 grid */}
              <div className="grid grid-cols-3 gap-2">
                {GRID_LAYOUT.map((cell) => {
                  const boxData = boxes?.[cell.name];
                  const count = boxData?.count ?? 0;
                  const isSelected = selectedBox === cell.name;

                  return (
                    <button
                      key={cell.name}
                      onClick={() => setSelectedBox(isSelected ? null : cell.name)}
                      className={`
                        relative rounded-xl border-2 p-4 text-left transition-all min-h-[140px] overflow-hidden
                        ${cell.bgColor} ${cell.color}
                        ${isSelected ? "ring-2 ring-brand-500 ring-offset-2 shadow-lg" : "shadow-sm"}
                      `}
                    >
                      <div className="text-sm font-semibold text-gray-800 truncate">{cell.name}</div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-gray-500 shrink-0" />
                        <span className="text-2xl font-bold text-gray-900">{count}</span>
                      </div>
                      {count > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 overflow-hidden max-h-[52px]">
                          {boxData!.employees.slice(0, 3).map((emp) => (
                            <span
                              key={emp.id}
                              className="inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-600 border border-gray-200 truncate max-w-full"
                            >
                              {emp.name}
                            </span>
                          ))}
                          {count > 3 && (
                            <span className="inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-500 border border-gray-200">
                              +{count - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* X-axis labels */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {PERFORMANCE_LABELS.map((label) => (
                  <div key={label} className="text-center">
                    <span className="text-xs font-medium text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
              <div className="text-center mt-1">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Performance &rarr;
                </span>
              </div>
            </div>
          </div>

          {/* Selected Box Detail Panel */}
          {selectedBox && selectedBoxData && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedBox}</h3>
                  <p className="text-sm text-gray-500">
                    {selectedBoxData.count} employee{selectedBoxData.count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBox(null)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {selectedBoxData.employees.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  No employees in this box.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                        <th className="px-6 py-3">Employee</th>
                        <th className="px-6 py-3">Department</th>
                        <th className="px-6 py-3">Performance</th>
                        <th className="px-6 py-3">Potential</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBoxData.employees.map((emp) => (
                        <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                                {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                              </div>
                              <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-600">{emp.department || "N/A"}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              {emp.rating.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                              {emp.potential.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* A5: Potential Assessment form + list */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Plus className="h-5 w-5 text-brand-600" />
                Assess Potential
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Rate an employee's potential (1–5) for this cycle. Saving an existing employee updates their rating.
              </p>
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Employee</label>
                  <select
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Select employee...</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Potential Rating: <span className="font-bold text-brand-600">{formRating}</span>
                  </label>
                  <div className="mt-2 flex gap-2">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormRating(r)}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
                          formRating === r
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Rationale for the potential rating..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Save Assessment
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">
                Assessments ({assessments.length})
              </h3>
              {assessments.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No potential assessments yet for this cycle.</p>
              ) : (
                <ul className="mt-4 divide-y divide-gray-100">
                  {assessments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {a.employee_name || `Employee ${a.employee_id}`}
                        </p>
                        {a.notes && <p className="truncate text-xs text-gray-500">{a.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          {a.potential_rating}/5
                        </span>
                        <button
                          onClick={() => startEdit(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Remove assessment?",
                                message: "Remove this potential assessment?",
                                confirmLabel: "Remove",
                                variant: "danger",
                              })
                            ) {
                              deleteMutation.mutate(a.id);
                            }
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
