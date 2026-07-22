import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Award, ChevronRight, Layers, Search } from "lucide-react";
import { apiGet } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import type { CompetencyFramework, PaginatedResponse } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
];

export function FrameworkListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [sortValue, setSortValue] = useState("created_at:desc");

  const [sort, order] = sortValue.split(":") as [string, "asc" | "desc"];

  const { data, isLoading } = useQuery({
    queryKey: ["frameworks", page, search, active, sortValue],
    queryFn: () =>
      apiGet<PaginatedResponse<CompetencyFramework>>("/competencies", {
        page,
        perPage: 20,
        sort,
        order,
        ...(search && { search }),
        ...(active && { is_active: active }),
      }),
  });

  const frameworks = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competency Frameworks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage competency frameworks and their competencies.
          </p>
        </div>
        <Link
          to="/competencies/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Framework
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search frameworks..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <select
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <select
          value={sortValue}
          onChange={(e) => {
            setSortValue(e.target.value);
            setPage(1);
          }}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : frameworks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Award className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No frameworks found</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your first competency framework to define evaluation criteria.
          </p>
          <Link
            to="/competencies/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create Framework
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <Link
              key={fw.id}
              to={`/competencies/${fw.id}`}
              className="group rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600">
                      {fw.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Created {formatDate(fw.created_at)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-400" />
              </div>
              {fw.description && (
                <p className="mt-3 text-sm text-gray-500 line-clamp-2">{fw.description}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <StatusBadge
                  colorClass={
                    fw.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }
                  className="px-2"
                >
                  {fw.is_active ? "Active" : "Inactive"}
                </StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
