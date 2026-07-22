import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Route, Search, Target, TrendingUp } from "lucide-react";
import { apiGet } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

interface CareerLevel {
  id: string;
  title: string;
  level: number;
}

interface CareerPathRef {
  id: string;
  name: string;
  department: string | null;
}

interface EmployeeTrack {
  id: string;
  employee_id: number;
  career_path_id: string;
  current_level_id: string;
  target_level_id: string | null;
  assigned_at: string;
  path: CareerPathRef | null;
  currentLevel: CareerLevel | null;
  targetLevel: CareerLevel | null;
}

export function EmployeeTrackPage() {
  const [employeeId, setEmployeeId] = useState("");

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["employee-track", employeeId],
    queryFn: () => apiGet<EmployeeTrack[]>(`/career-paths/tracks/employee/${employeeId}`),
    enabled: !!employeeId,
  });

  const tracks = data?.data ?? [];
  const selectedUser = orgUsers.find((u) => String(u.id) === employeeId);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to="/career-paths"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <Route className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Career Track</h1>
          <p className="mt-1 text-sm text-gray-500">
            View an employee's assigned career paths and progression.
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— Select an employee —</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!employeeId ? (
        <div className="mt-12 text-center text-sm text-gray-400">
          Select an employee to view their career tracks.
        </div>
      ) : isLoading || isFetching ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {selectedUser?.full_name || "This employee"} is not assigned to any career track yet.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {tracks.map((track) => (
            <div key={track.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <Link
                  to={`/career-paths/${track.career_path_id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-brand-600"
                >
                  {track.path?.name ?? "Career Path"}
                </Link>
                {track.path?.department && (
                  <StatusBadge colorClass="bg-gray-100 text-gray-600">
                    {track.path.department}
                  </StatusBadge>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-brand-600" />
                  <div>
                    <p className="text-xs text-gray-500">Current Level</p>
                    <p className="text-sm font-medium text-gray-900">
                      {track.currentLevel
                        ? `L${track.currentLevel.level} — ${track.currentLevel.title}`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-xs text-gray-500">Target Level</p>
                    <p className="text-sm font-medium text-gray-900">
                      {track.targetLevel
                        ? `L${track.targetLevel.level} — ${track.targetLevel.title}`
                        : "Not set"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
