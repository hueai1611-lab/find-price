import Link from 'next/link';

import { loadInspectRowPageData } from '@/lib/inspect/load-inspect-row';

type PageProps = {
  searchParams: Promise<{ itemId?: string }>;
};

export default async function InspectRowPage({ searchParams }: PageProps) {
  const { itemId } = await searchParams;
  const data = await loadInspectRowPageData(itemId);

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">{data.title}</p>
          <p className="mt-2 text-red-900/90">{data.message}</p>
        </div>
        <Link
          href="/search"
          className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dòng nguồn Excel
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-600">{data.itemLabel}</p>
        </div>
        <Link
          href="/search"
          className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link>
      </header>

      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-700">
        <p>
          Sheet <span className="font-semibold">{data.sheetName}</span> · dòng
          (1-based){' '}
          <span className="font-semibold">{data.sourceRowNumber}</span>
        </p>
        <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
          {data.resolvedPath}
        </p>
        <p className="mt-1 break-all text-[10px] text-slate-500">
          SOURCE_XLSX_ROOT: {data.sourceXlsxRoot}
        </p>
      </div>

      {!data.sanity.ok ? (
        <div
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950"
          role="status"
        >
          <strong>Sanity check:</strong> {data.sanity.reason}
        </div>
      ) : data.sanity.skipped ? (
        <p className="mb-6 text-xs text-slate-500">
          Sanity check skipped (no nhóm / nội dung / quy text long enough to
          compare).
        </p>
      ) : (
        <p className="mb-6 text-xs font-medium text-emerald-800">
          Sanity check: row text matches DB fields.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="max-h-[min(75vh,720px)] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
            <tbody>
              {data.windowRows.map((row, i) => {
                const isHit = i === data.highlightIndex;
                return (
                  <tr
                    key={data.lineNumbers1Based[i]}
                    id={isHit ? 'inspect-highlight-row' : undefined}
                    className={
                      isHit
                        ? 'bg-amber-100'
                        : 'even:bg-slate-50/80 hover:bg-slate-50'
                    }
                  >
                    <td className="border-b border-slate-200 px-2 py-1 text-right tabular-nums text-slate-500">
                      {data.lineNumbers1Based[i]}
                    </td>
                    {(row as unknown[]).map((cell, j) => (
                      <td
                        key={j}
                        className="border-b border-slate-200 px-2 py-1 whitespace-pre-wrap text-slate-800"
                      >
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
