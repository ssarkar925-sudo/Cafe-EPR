/**
 * V1 admin table (server component). Renders server-returned rows as-is
 * (authoritative display, no client computation) with consistent
 * loading/error/empty handling done by the calling page.
 */

export interface V1TableColumn {
  key: string;
  label: string;
  mono?: boolean;
}

export default function V1AdminTable<T extends object>({
  columns,
  rows,
  emptyText = "No rows.",
  rowKey,
  actions,
}: {
  columns: V1TableColumn[];
  rows: T[];
  emptyText?: string;
  rowKey: (row: T, index: number) => string;
  actions?: (row: T, index: number) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/10">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {col.label}
              </th>
            ))}
            {actions ? (
              <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-slate-100 last:border-0 dark:border-white/5"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 align-top text-slate-700 dark:text-slate-200${
                    col.mono ? " font-mono text-xs" : ""
                  }`}
                >
                  {formatCell((row as Record<string, unknown>)[col.key])}
                </td>
              ))}
              {actions ? <td className="px-4 py-2.5 align-top">{actions(row, index)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-slate-400">—</span>;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  return String(value);
}
