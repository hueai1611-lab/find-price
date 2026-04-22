import Link from "next/link";

import { loadInspectRowPageData } from "@/lib/inspect/load-inspect-row";

type PageProps = {
  searchParams: Promise<{ itemId?: string }>;
};

export default async function InspectRowPage({ searchParams }: PageProps) {
  const { itemId } = await searchParams;
  const data = await loadInspectRowPageData(itemId);

  if (!data.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-zinc-900">
        <p className="mb-2 font-semibold text-red-800">{data.title}</p>
        <p className="mb-6 text-zinc-700">{data.message}</p>
        <Link href="/search" className="text-blue-700 underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-zinc-900">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Source row</h1>
        <Link href="/search" className="text-blue-700 underline">
          ← Search
        </Link>
      </div>

      <p className="mb-1 font-mono text-xs text-zinc-600">{data.itemLabel}</p>
      <p className="mb-1 text-xs text-zinc-600">
        Sheet <span className="font-medium">{data.sheetName}</span> · 1-based row{" "}
        <span className="font-medium">{data.sourceRowNumber}</span>
      </p>
      <p className="mb-1 break-all font-mono text-[10px] text-zinc-500">{data.resolvedPath}</p>
      <p className="mb-4 text-[10px] text-zinc-500">
        SOURCE_XLSX_ROOT effective: <span className="break-all">{data.sourceXlsxRoot}</span>
      </p>

      {!data.sanity.ok ? (
        <div
          className="mb-4 border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          role="status"
        >
          <strong>Sanity check:</strong> {data.sanity.reason}
        </div>
      ) : data.sanity.skipped ? (
        <p className="mb-4 text-xs text-zinc-500">
          Sanity check skipped (no nhóm / nội dung / quy text long enough to compare).
        </p>
      ) : (
        <p className="mb-4 text-xs text-green-800">Sanity check: row text matches DB fields.</p>
      )}

      <div className="overflow-x-auto border border-zinc-300 bg-white">
        <table className="w-full border-collapse font-mono text-[11px]">
          <tbody>
            {data.windowRows.map((row, i) => {
              const isHit = i === data.highlightIndex;
              return (
                <tr
                  key={data.lineNumbers1Based[i]}
                  id={isHit ? "inspect-highlight-row" : undefined}
                  className={isHit ? "bg-amber-200" : "even:bg-zinc-50"}
                >
                  <td className="border border-zinc-200 px-1 py-0.5 text-right text-zinc-500">
                    {data.lineNumbers1Based[i]}
                  </td>
                  {(row as unknown[]).map((cell, j) => (
                    <td key={j} className="border border-zinc-200 px-1 py-0.5 whitespace-pre-wrap">
                      {String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
