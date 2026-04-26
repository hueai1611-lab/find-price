'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import type { LinkExcelTarget } from '@/lib/excel/external-link-formula';

type PeriodsResponse = { pricePeriodCodes?: unknown };

/** All names vs visible-only; both come from the same parse of the uploaded file. */
type SheetNameLists = { all: string[]; visible: string[] };

/**
 * Uses `wb.Workbook.Sheets[].name` + `Hidden` (0=visible, 1=hidden, 2=veryHidden).
 * Falls back to full `SheetNames` when metadata is missing or does not align with names.
 */
function sheetNameListsFromWorkbook(wb: XLSX.WorkBook): SheetNameLists {
  const all = [...(wb.SheetNames ?? [])];
  const sheets = wb.Workbook?.Sheets;
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { all, visible: [...all] };
  }

  const hiddenByName = new Map<string, number>();
  for (const entry of sheets) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) continue;
    hiddenByName.set(entry.name, entry.Hidden ?? 0);
  }
  if (hiddenByName.size === 0) {
    return { all, visible: [...all] };
  }

  let anyNameMatched = false;
  for (const n of all) {
    if (hiddenByName.has(n)) {
      anyNameMatched = true;
      break;
    }
  }
  if (!anyNameMatched) {
    return { all, visible: [...all] };
  }

  const visible = all.filter((n) => {
    const h = hiddenByName.get(n);
    if (h === undefined) return true;
    return h === 0;
  });

  return { all, visible: visible.length > 0 ? visible : [...all] };
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

export default function DailyFileLinkedTongCongPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sheetLists, setSheetLists] = useState<SheetNameLists | null>(null);
  const [includeHiddenSheets, setIncludeHiddenSheets] = useState(false);
  const [sheetName, setSheetName] = useState('');
  const [inputCol, setInputCol] = useState('A');
  const [startRow, setStartRow] = useState(2);
  const [pricePeriodCodes, setPricePeriodCodes] = useState<string[]>([]);
  const [pricePeriodCode, setPricePeriodCode] = useState('');
  /** Controls separator style in external workbook formulas (Windows vs Excel for Mac). */
  const [linkTarget, setLinkTarget] = useState<LinkExcelTarget>('windows');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/search/price-periods', {
          cache: 'no-store',
        });
        const data = (await res.json()) as PeriodsResponse;
        const raw = Array.isArray(data.pricePeriodCodes)
          ? data.pricePeriodCodes.filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0,
            )
          : [];
        if (!cancelled) {
          setPricePeriodCodes(raw);
          if (!pricePeriodCode && raw.length > 0)
            setPricePeriodCode(raw[raw.length - 1]);
        }
      } catch {
        // keep empty; user can still type a period code later if needed
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!file) {
        setSheetLists(null);
        setIncludeHiddenSheets(false);
        setSheetName('');
        return;
      }
      setError(null);
      setDone(null);
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const lists = sheetNameListsFromWorkbook(wb);
        if (!cancelled) {
          setSheetLists(lists);
          setIncludeHiddenSheets(false);
          const pick = lists.visible[0] ?? lists.all[0] ?? '';
          setSheetName(pick);
        }
      } catch {
        if (!cancelled)
          setError('Không đọc được file Excel. Hãy thử lại với .xlsx hợp lệ.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const sheetOptions = useMemo(() => {
    if (!sheetLists) return [];
    return includeHiddenSheets ? sheetLists.all : sheetLists.visible;
  }, [sheetLists, includeHiddenSheets]);

  useEffect(() => {
    if (!sheetLists || sheetOptions.length === 0) return;
    setSheetName((prev) =>
      prev && sheetOptions.includes(prev) ? prev : (sheetOptions[0] ?? ''),
    );
  }, [sheetLists, sheetOptions]);

  const canSubmit = useMemo(() => {
    return Boolean(
      file &&
      sheetName &&
      inputCol.trim() &&
      startRow >= 1 &&
      pricePeriodCode.trim(),
    );
  }, [file, sheetName, inputCol, startRow, pricePeriodCode]);

  async function onGenerate() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('sheetName', sheetName);
      fd.set('inputCol', inputCol);
      fd.set('startRow', String(startRow));
      fd.set('pricePeriodCode', pricePeriodCode);
      fd.set('linkTarget', linkTarget);

      const res = await fetch('/api/daily-file/link-tongcong', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: unknown;
        };
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Tạo file thất bại (${res.status} ${res.statusText}).`;
        setError(msg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily-search-results-${pricePeriodCode}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const processed = res.headers.get('X-Rows-Processed');
      const linked = res.headers.get('X-Rows-Linked');
      const blank = res.headers.get('X-Rows-Blank');
      setDone(
        `Đã tạo file kết quả. processed=${processed ?? '?'}, linked=${linked ?? '?'}, không LINKED=${blank ?? '?'}.`,
      );
    } catch {
      setError('Có lỗi khi upload hoặc tải file kết quả.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Daily file → kết quả tra cứu
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload file ngày chỉ để đọc cột truy vấn; hệ thống xuất{' '}
          <span className="font-medium">file kết quả mới</span> (sheet &quot;Kết
          quả&quot;) với link <span className="font-mono">tongCong</span> tới
          quarter master khi đủ dữ liệu.
        </p>
        {/* <Link
          href="/search"
          className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link> */}
      </header>

      <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 sm:col-span-2 border-b border-gray-300 pb-2">
            <span className="text-sm font-medium text-slate-800">
              Input file to search (.xlsx)
            </span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">Sheet</span>
            <select
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className={inputClass}
              disabled={sheetOptions.length === 0}
            >
              {sheetOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={includeHiddenSheets}
                onChange={(e) => setIncludeHiddenSheets(e.target.checked)}
              />
              Include hidden sheets
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              pricePeriodCode
            </span>
            <input
              list="price-period-codes"
              value={pricePeriodCode}
              onChange={(e) => setPricePeriodCode(e.target.value)}
              className={inputClass}
              placeholder="Q2_2026"
            />
            <datalist id="price-period-codes">
              {pricePeriodCodes.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-medium text-slate-800">
              Target Excel (link path style)
            </span>
            <select
              value={linkTarget}
              onChange={(e) =>
                setLinkTarget(e.target.value === 'mac' ? 'mac' : 'windows')
              }
              className={inputClass}
            >
              <option value="windows">Windows</option>
              <option value="mac">Mac</option>
            </select>
            <div className="space-y-2 text-xs leading-relaxed text-slate-600 hidden">
              <p>
                <span className="font-medium text-slate-700">Windows:</span>{' '}
                pick this when users open the download in Excel on Windows. The
                quarter-master root in Settings should be a path that works
                there (typically UNC like{' '}
                <span className="font-mono">
                  {'\\\\server\\share\\folder\\'}
                </span>{' '}
                or a drive path). The app turns{' '}
                <span className="font-mono">/</span> into{' '}
                <span className="font-mono">\</span> inside the formula and ends
                the folder with <span className="font-mono">\</span>.
              </p>
              <p>
                <span className="font-medium text-slate-700">Mac:</span> pick
                this when users open the download in Excel for Mac. Configure
                the quarter-master root the way macOS sees it (for example{' '}
                <span className="font-mono">/Volumes/ShareName/folder/</span>{' '}
                after mounting, or{' '}
                <span className="font-mono">//server/share/folder/</span>). The
                app turns <span className="font-mono">\</span> into{' '}
                <span className="font-mono">/</span> and ends the folder with{' '}
                <span className="font-mono">/</span>. It does not guess mount
                names from a Windows UNC.
              </p>
              <p className="text-slate-500">
                Công thức link nằm ở cột &quot;Linked formula&quot; trong file
                kết quả; chỉ đổi kiểu đường dẫn theo Windows/Mac. Giá trị số
                cache (nếu có) giúp xem nhanh trước khi Excel resolve link.
              </p>
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              Input column (query)
            </span>
            <input
              value={inputCol}
              onChange={(e) => setInputCol(e.target.value)}
              className={inputClass}
              placeholder="A"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              Start row (1-based)
            </span>
            <input
              type="number"
              min={1}
              max={1000000}
              value={startRow}
              onChange={(e) => setStartRow(Number(e.target.value) || 1)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={onGenerate}
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : 'Xuất file kết quả'}
          </button>
          <span className="text-xs text-slate-600 hidden">
            Sheet &quot;Kết quả&quot;: 8 cột (STT → Status). Cột &quot;Giá
            Tổng&quot; và &quot;Linked formula&quot; được tô nền nổi bật ở
            header và nền rất nhạt ở phần dữ liệu. Trạng thái: LINKED, NO_MATCH,
            NO_LINK, EMPTY_QUERY.
          </span>
        </div>
      </section>

      {done ? (
        <p
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          role="status"
        >
          {done}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </main>
  );
}
