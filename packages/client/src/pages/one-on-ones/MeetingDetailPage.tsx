import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Circle,
  Loader2,
  Calendar,
  Clock,
  Save,
  Pencil,
  Trash2,
  X,
  ListTodo,
  Users,
  RotateCcw,
  Ban,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  is_discussed: boolean;
  order: number;
}

interface ActionItem {
  id: string;
  description: string;
  assignee_id: number | null;
  assignee_name: string | null;
  due_date: string | null;
  status: string;
}

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

interface MeetingDetail {
  id: string;
  title: string;
  employee_id: number;
  manager_id: number;
  employee_name: string | null;
  manager_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  meeting_notes: string | null;
  agendaItems: AgendaItem[];
  actionItems: ActionItem[];
}

const ACTION_STATUSES = ["open", "in_progress", "done", "cancelled"];

export function MeetingDetailPage() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newItemTitle, setNewItemTitle] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [editingAgendaTitle, setEditingAgendaTitle] = useState("");
  const [showEditMeeting, setShowEditMeeting] = useState(false);

  // Action item form
  const [newActionDesc, setNewActionDesc] = useState("");
  const [newActionAssignee, setNewActionAssignee] = useState("");
  const [newActionDue, setNewActionDue] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["meetings", id] });

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", id],
    queryFn: () => apiGet<MeetingDetail>(`/meetings/${id}`),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const addItemMutation = useMutation({
    mutationFn: (title: string) => apiPost(`/meetings/${id}/agenda`, { title }),
    onSuccess: () => {
      invalidate();
      setNewItemTitle("");
      toast.success("Agenda item added");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to add item"),
  });

  const completeItemMutation = useMutation({
    mutationFn: (itemId: string) => apiPost(`/meetings/agenda/${itemId}/complete`),
    onSuccess: invalidate,
  });

  const editAgendaMutation = useMutation({
    mutationFn: (payload: { itemId: string; title: string }) =>
      apiPut(`/meetings/agenda/${payload.itemId}`, { title: payload.title }),
    onSuccess: () => {
      invalidate();
      setEditingAgendaId(null);
      toast.success("Agenda item updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to update"),
  });

  const deleteAgendaMutation = useMutation({
    mutationFn: (itemId: string) => apiDelete(`/meetings/agenda/${itemId}`),
    onSuccess: () => {
      invalidate();
      toast.success("Agenda item removed");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to delete"),
  });

  const saveNotesMutation = useMutation({
    mutationFn: (meeting_notes: string) => apiPut(`/meetings/${id}`, { meeting_notes }),
    onSuccess: () => {
      invalidate();
      toast.success("Notes saved");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to save notes"),
  });

  const editMeetingMutation = useMutation({
    mutationFn: (body: any) => apiPut(`/meetings/${id}`, body),
    onSuccess: () => {
      invalidate();
      setShowEditMeeting(false);
      toast.success("Meeting updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to update"),
  });

  const completeMeetingMutation = useMutation({
    mutationFn: () => apiPost(`/meetings/${id}/complete`),
    onSuccess: () => {
      invalidate();
      toast.success("Meeting completed");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed"),
  });

  const reopenMutation = useMutation({
    mutationFn: () => apiPost(`/meetings/${id}/reopen`),
    onSuccess: () => {
      invalidate();
      toast.success("Meeting reopened");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiPost(`/meetings/${id}/cancel`),
    onSuccess: () => {
      invalidate();
      toast.success("Meeting cancelled");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed"),
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: () => apiDelete(`/meetings/${id}`),
    onSuccess: () => {
      toast.success("Meeting deleted");
      navigate("/one-on-ones");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to delete"),
  });

  const addActionMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/meetings/${id}/action-items`, body),
    onSuccess: () => {
      invalidate();
      setNewActionDesc("");
      setNewActionAssignee("");
      setNewActionDue("");
      toast.success("Action item added");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to add"),
  });

  const updateActionMutation = useMutation({
    mutationFn: (payload: { actionId: string; body: any }) =>
      apiPut(`/meetings/action-items/${payload.actionId}`, payload.body),
    onSuccess: invalidate,
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to update"),
  });

  const deleteActionMutation = useMutation({
    mutationFn: (actionId: string) => apiDelete(`/meetings/action-items/${actionId}`),
    onSuccess: () => {
      invalidate();
      toast.success("Action item removed");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to delete"),
  });

  const meeting = data?.data;
  const currentNotes = notes ?? meeting?.meeting_notes ?? "";
  const isCompleted = meeting?.status === "completed";
  const isCancelled = meeting?.status === "cancelled";
  const locked = isCompleted || isCancelled;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Meeting not found.</p>
        <Link to="/one-on-ones" className="mt-2 text-brand-600 underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/one-on-ones"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {meeting.employee_name ?? `#${meeting.employee_id}`}
              {" · "}
              {meeting.manager_name ?? `#${meeting.manager_id}`}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(meeting.scheduled_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {meeting.duration_minutes} min
            </span>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            isCompleted
              ? "bg-green-50 text-green-700"
              : isCancelled
                ? "bg-gray-100 text-gray-500"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {meeting.status}
        </span>
      </div>

      {/* Meeting actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!locked && (
          <button
            onClick={() => setShowEditMeeting((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit details
          </button>
        )}
        {locked && (
          <button
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reopen
          </button>
        )}
        {!isCancelled && (
          <button
            onClick={async () => {
              if (
                await confirm({
                  title: "Cancel meeting?",
                  message: "Cancel this meeting? It can be reopened later.",
                  confirmLabel: "Cancel meeting",
                  variant: "default",
                })
              ) {
                cancelMutation.mutate();
              }
            }}
            disabled={cancelMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            <Ban className="h-4 w-4" />
            Cancel
          </button>
        )}
        <button
          onClick={async () => {
            if (
              await confirm({
                title: "Delete meeting?",
                message: "Permanently delete this meeting and all its items?",
                confirmLabel: "Delete",
                variant: "danger",
              })
            ) {
              deleteMeetingMutation.mutate();
            }
          }}
          disabled={deleteMeetingMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      {showEditMeeting && !locked && (
        <EditMeetingForm
          meeting={meeting}
          isPending={editMeetingMutation.isPending}
          onCancel={() => setShowEditMeeting(false)}
          onSave={(body) => editMeetingMutation.mutate(body)}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Agenda Items */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Agenda Items</h2>

          <div className="mt-4 space-y-2">
            {(meeting.agendaItems || []).map((item) =>
              editingAgendaId === item.id ? (
                <form
                  key={item.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editingAgendaTitle.trim())
                      editAgendaMutation.mutate({ itemId: item.id, title: editingAgendaTitle.trim() });
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={editingAgendaTitle}
                    onChange={(e) => setEditingAgendaTitle(e.target.value)}
                    autoFocus
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button type="submit" className="rounded-lg bg-brand-600 px-2.5 text-white hover:bg-brand-700">
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgendaId(null)}
                    className="rounded-lg border border-gray-300 px-2.5 text-gray-600 hover:bg-gray-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div
                  key={item.id}
                  className="group flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <button
                    onClick={() => {
                      if (!locked) completeItemMutation.mutate(item.id);
                    }}
                    disabled={locked}
                    className="mt-0.5 flex-shrink-0"
                    title="Toggle discussed"
                  >
                    {item.is_discussed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300 hover:text-brand-500" />
                    )}
                  </button>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        item.is_discussed ? "text-gray-400 line-through" : "text-gray-900"
                      }`}
                    >
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
                    )}
                  </div>
                  {!locked && (
                    <div className="flex flex-shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingAgendaId(item.id);
                          setEditingAgendaTitle(item.title);
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Remove agenda item?",
                              message: "Remove this agenda item?",
                              confirmLabel: "Remove",
                              variant: "danger",
                            })
                          )
                            deleteAgendaMutation.mutate(item.id);
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}

            {meeting.agendaItems?.length === 0 && (
              <p className="text-sm text-gray-400 italic">No agenda items yet.</p>
            )}
          </div>

          {!locked && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newItemTitle.trim()) addItemMutation.mutate(newItemTitle.trim());
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="Add agenda item..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!newItemTitle.trim() || addItemMutation.isPending}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Meeting Notes</h2>
          <textarea
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={locked}
            rows={10}
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            placeholder="Take notes during the meeting..."
          />
          {!locked && (
            <div className="mt-3 flex justify-between">
              <button
                onClick={() => saveNotesMutation.mutate(currentNotes)}
                disabled={saveNotesMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saveNotesMutation.isPending ? "Saving..." : "Save Notes"}
              </button>
              <button
                onClick={() => completeMeetingMutation.mutate()}
                disabled={completeMeetingMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {completeMeetingMutation.isPending ? "Completing..." : "Complete Meeting"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Items */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ListTodo className="h-5 w-5 text-brand-600" />
          Action Items
        </h2>

        <div className="mt-4 space-y-2">
          {(meeting.actionItems || []).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="flex-1 min-w-[200px]">
                <p
                  className={`text-sm font-medium ${
                    a.status === "done" ? "text-gray-400 line-through" : "text-gray-900"
                  }`}
                >
                  {a.description}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {a.assignee_name ?? (a.assignee_id ? `#${a.assignee_id}` : "Unassigned")}
                  {a.due_date ? ` · due ${a.due_date}` : ""}
                </p>
              </div>
              <select
                value={a.status}
                onChange={(e) =>
                  updateActionMutation.mutate({ actionId: a.id, body: { status: e.target.value } })
                }
                disabled={locked}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
              >
                {ACTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              {!locked && (
                <button
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Remove action item?",
                        message: "Remove this action item?",
                        confirmLabel: "Remove",
                        variant: "danger",
                      })
                    )
                      deleteActionMutation.mutate(a.id);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {meeting.actionItems?.length === 0 && (
            <p className="text-sm text-gray-400 italic">No action items yet.</p>
          )}
        </div>

        {!locked && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newActionDesc.trim()) return;
              addActionMutation.mutate({
                description: newActionDesc.trim(),
                assignee_id: newActionAssignee ? Number(newActionAssignee) : null,
                due_date: newActionDue || null,
              });
            }}
            className="mt-4 flex flex-wrap items-end gap-2"
          >
            <input
              value={newActionDesc}
              onChange={(e) => setNewActionDesc(e.target.value)}
              placeholder="New action item..."
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <select
              value={newActionAssignee}
              onChange={(e) => setNewActionAssignee(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Unassigned</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newActionDue}
              onChange={(e) => setNewActionDue(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!newActionDesc.trim() || addActionMutation.isPending}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function EditMeetingForm({
  meeting,
  isPending,
  onCancel,
  onSave,
}: {
  meeting: MeetingDetail;
  isPending: boolean;
  onCancel: () => void;
  onSave: (body: any) => void;
}) {
  const initialDate = meeting.scheduled_at.slice(0, 10);
  const initialTime = new Date(meeting.scheduled_at).toISOString().slice(11, 16);
  const [title, setTitle] = useState(meeting.title);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(meeting.duration_minutes);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const scheduled_at = new Date(`${date}T${time || "10:00"}:00`).toISOString();
        onSave({ title: title.trim(), scheduled_at, duration_minutes: Number(duration) });
      }}
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={2}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Duration (min)</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
