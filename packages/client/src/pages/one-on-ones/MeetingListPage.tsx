import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  Users,
  Calendar,
  Clock,
  Loader2,
  CheckCircle2,
  Search,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";

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

interface MeetingPage {
  data: Meeting[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const STATUS_OPTIONS = ["", "requested", "scheduled", "completed", "cancelled"];

export function MeetingListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("scheduled_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", page, search, status, sort, order],
    queryFn: () =>
      apiGet<MeetingPage>("/meetings", {
        page,
        perPage: 20,
        sort,
        order,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
      }),
  });

  const meetings = data?.data?.data ?? [];
  const pager = data?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">1-on-1 Meetings</h1>
          <p className="mt-1 text-sm text-gray-500">Schedule and track one-on-one meetings.</p>
        </div>
        <Link
          to="/one-on-ones/new"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Meeting
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":");
            setSort(s);
            setOrder(o as "asc" | "desc");
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="scheduled_at:desc">Date (newest)</option>
          <option value="scheduled_at:asc">Date (oldest)</option>
          <option value="title:asc">Title (A–Z)</option>
          <option value="title:desc">Title (Z–A)</option>
          <option value="status:asc">Status</option>
        </select>
      </div>

      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No meetings found"
          description="Try adjusting your filters or schedule a new 1-on-1 meeting."
        />
      ) : (
        <div className="mt-6 space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}

      {/* Pager */}
      {pager && (
        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const isCompleted = meeting.status === "completed";
  const isCancelled = meeting.status === "cancelled";

  return (
    <Link
      to={`/one-on-ones/${meeting.id}`}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
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
            {meeting.employee_name ?? `#${meeting.employee_id}`}
            {" · "}
            {meeting.manager_name ?? `#${meeting.manager_id}`}
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
      <StatusBadge
        colorClass={
          isCompleted
            ? "bg-green-50 text-green-700"
            : isCancelled
              ? "bg-gray-100 text-gray-500"
              : "bg-blue-50 text-blue-700"
        }
      >
        {meeting.status}
      </StatusBadge>
    </Link>
  );
}
