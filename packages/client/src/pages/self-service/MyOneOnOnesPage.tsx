import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

interface Meeting {
  id: string;
  title: string;
  employee_id: number;
  manager_id: number;
  employee_name: string | null;
  manager_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
}

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

export function MyOneOnOnesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showRequest, setShowRequest] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "my", user?.empcloudUserId],
    queryFn: () =>
      apiGet<{ data: Meeting[]; total: number }>("/meetings", {
        employeeId: user?.empcloudUserId,
        perPage: 100,
      }),
    enabled: !!user,
  });

  const meetings = data?.data?.data || [];
  const upcoming = meetings.filter((m) => m.status === "scheduled" || m.status === "requested");
  const past = meetings.filter((m) => m.status === "completed" || m.status === "cancelled");

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My 1-on-1s</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your upcoming and past one-on-one meetings.
          </p>
        </div>
        <button
          onClick={() => setShowRequest((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showRequest ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showRequest ? "Close" : "Request 1-on-1"}
        </button>
      </div>

      {showRequest && (
        <RequestMeetingForm
          onDone={() => {
            setShowRequest(false);
            queryClient.invalidateQueries({ queryKey: ["meetings", "my"] });
          }}
        />
      )}

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No meetings yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Request a 1-on-1 with your manager to get started.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-500 mb-3">
                Past ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RequestMeetingForm({ onDone }: { onDone: () => void }) {
  const [managerId, setManagerId] = useState("");
  const [title, setTitle] = useState("1-on-1 request");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (body: any) => apiPost("/meetings/request", body),
    onSuccess: () => {
      toast.success("1-on-1 requested");
      onDone();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to request meeting"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!managerId) return toast.error("Select a manager");
        if (!date) return toast.error("Pick a date");
        const scheduled_at = new Date(`${date}T${time || "10:00"}:00`).toISOString();
        mutation.mutate({
          manager_id: Number(managerId),
          title: title.trim() || "1-on-1 request",
          scheduled_at,
          duration_minutes: Number(duration) || 30,
        });
      }}
      className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Manager <span className="text-red-500">*</span>
        </label>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          required
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">— Select a manager —</option>
          {orgUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.email})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Topic / Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={2}
          maxLength={200}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={new Date().toISOString().slice(0, 10)}
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
            {[15, 30, 45, 60].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {mutation.isPending ? "Requesting..." : "Send Request"}
      </button>
    </form>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const isCompleted = meeting.status === "completed";

  return (
    <Link
      to={`/my/one-on-ones/${meeting.id}`}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          isCompleted ? "bg-green-50" : "bg-blue-50"
        }`}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Calendar className="h-5 w-5 text-blue-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 truncate">{meeting.title}</h3>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            with {meeting.manager_name ?? `#${meeting.manager_id}`}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(meeting.scheduled_at)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {meeting.duration_minutes} min
          </span>
        </div>
      </div>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isCompleted ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
        }`}
      >
        {meeting.status}
      </span>
    </Link>
  );
}
