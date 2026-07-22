// Shared pagination controls — "Page X of Y (N total)" + Previous/Next.
// Renders nothing when there's a single page. Replaces the Prev/Next block that
// was copy-pasted across ~18 list pages.
//
//   <Pagination page={page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} />
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  className = "mt-6",
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (!totalPages || totalPages <= 1) return null;

  const btn =
    "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages}
        {total != null ? ` (${total} total)` : ""}
      </p>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={btn}>
          Previous
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={btn}
        >
          Next
        </button>
      </div>
    </div>
  );
}
