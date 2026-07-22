import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, ArrowLeft } from "lucide-react";
import { apiGet } from "@/api/client";
import { Pagination } from "@/components/Pagination";
import type { PaginatedResponse } from "@emp-performance/shared";

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

interface RosterEntry {
  id: string;
  employee_id: number;
  career_path_id: string;
  assigned_at: string;
  path: CareerPathRef | null;
  currentLevel: CareerLevel | null;
  targetLevel: CareerLevel | null;
}

export function CareerTrackRosterPage() {
  const [page, setPage] = useState(1);

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const userById = new Map<number, OrgUser>(
    (usersData?.data ?? []).map((u) => [u.id, u]),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["career-roster", page],
    queryFn: () =>
      apiGet<PaginatedResponse<RosterEntry>>("/career-paths/tracks/roster", {
        page,
        perPage: 20,
      }),
  });

  const rows = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to="/career-paths"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-brand-600" />
            Career Track Roster
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Every employee currently assigned to a career path.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          No employees are assigned to any career track yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Employee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Career Path
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Target Level
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const user = userById.get(row.employee_id);
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {user ? user.full_name : `Employee #${row.employee_id}`}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/career-paths/${row.career_path_id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {row.path?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.currentLevel
                        ? `L${row.currentLevel.level} — ${row.currentLevel.title}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.targetLevel
                        ? `L${row.targetLevel.level} — ${row.targetLevel.title}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
