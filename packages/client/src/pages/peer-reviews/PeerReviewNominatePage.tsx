import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Loader2, Search, Check, X, Clock } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface ReviewCycle {
  id: string;
  name: string;
  status: string;
}

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

interface Nomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  created_at: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const STATUS_BADGE: Record<string, { className: string; icon: typeof Check }> = {
  pending: { className: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { className: "bg-green-50 text-green-700", icon: Check },
  declined: { className: "bg-red-50 text-red-700", icon: X },
};

export function PeerReviewNominatePage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [cycleId, setCycleId] = useState("");
  const [nomineeId, setNomineeId] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles", "for-nominate"],
    queryFn: () => apiGet<Paginated<ReviewCycle>>("/review-cycles", { page: 1, perPage: 100 }),
  });
  const cycles = (cyclesData?.data?.data ?? []).filter(
    (c) => c.status === "active" || c.status === "draft",
  );

  const { data: usersData } = useQuery({
    queryKey: ["users", "list", userSearch],
    queryFn: () => apiGet<OrgUser[]>("/users", userSearch ? { q: userSearch } : undefined),
  });
  const orgUsers = (usersData?.data ?? []).filter(
    (u) => u.id !== currentUser?.empcloudUserId,
  );

  const { data: nominationsData, isLoading: nomLoading } = useQuery({
    queryKey: ["peer-nominations", "mine", cycleId],
    enabled: !!cycleId && !!currentUser?.empcloudUserId,
    queryFn: () =>
      apiGet<Paginated<Nomination>>("/peer-reviews/nominations", {
        cycleId,
        employeeId: currentUser?.empcloudUserId,
        perPage: 50,
      }),
  });
  const nominations = nominationsData?.data?.data ?? [];

  const nominateMutation = useMutation({
    mutationFn: (body: { cycle_id: string; employee_id: number; nominee_id: number }) =>
      apiPost("/peer-reviews/nominate", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peer-nominations"] });
      toast.success("Peer nominated for review");
      setNomineeId("");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to nominate peer"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleId) {
      toast.error("Select a review cycle");
      return;
    }
    if (!nomineeId) {
      toast.error("Select a peer to nominate");
      return;
    }
    nominateMutation.mutate({
      cycle_id: cycleId,
      employee_id: currentUser!.empcloudUserId,
      nominee_id: parseInt(nomineeId),
    });
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nominate Peer Reviewers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Suggest colleagues to provide peer feedback for your review cycle. HR approves nominations.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Review Cycle <span className="text-red-500">*</span>
          </label>
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— Select a cycle —</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Find a colleague</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Peer reviewer <span className="text-red-500">*</span>
          </label>
          <select
            value={nomineeId}
            onChange={(e) => setNomineeId(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— Select a peer —</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={nominateMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {nominateMutation.isPending ? "Nominating..." : "Nominate Peer"}
        </button>
      </form>

      {/* My nominations for the selected cycle */}
      {cycleId && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">My Nominations</h2>
          {nomLoading ? (
            <div className="mt-4 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : nominations.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              You have not nominated anyone for this cycle yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {nominations.map((n) => {
                const badge = STATUS_BADGE[n.status] || STATUS_BADGE.pending;
                const BadgeIcon = badge.icon;
                return (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="text-sm text-gray-700">
                      Peer reviewer: <span className="font-medium">User #{n.nominee_id}</span>
                      <span className="ml-3 text-xs text-gray-400">{formatDate(n.created_at)}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge.className}`}
                    >
                      <BadgeIcon className="h-3 w-3" />
                      {n.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
