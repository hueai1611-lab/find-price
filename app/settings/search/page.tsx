'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type Settings = {
  takePrimaryTechnical: number;
  takePrimarySimple: number;
  takeDiameterRescue: number;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

export default function SearchRetrievalSettingsPage() {
  const [values, setValues] = useState<Settings>({
    takePrimaryTechnical: 350,
    takePrimarySimple: 50,
    takeDiameterRescue: 800,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/search/retrieval-settings', {
          cache: 'no-store',
        });
        const data = (await res.json()) as Partial<Settings> & {
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setError(
              typeof data.error === 'string' ? data.error : res.statusText,
            );
          }
          return;
        }
        if (!cancelled) {
          setValues({
            takePrimaryTechnical: Number(data.takePrimaryTechnical) || 350,
            takePrimarySimple: Number(data.takePrimarySimple) || 50,
            takeDiameterRescue: Number(data.takeDiameterRescue) || 800,
          });
        }
      } catch {
        if (!cancelled) setError('Không tải được cấu hình.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/search/retrieval-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as Partial<Settings> & { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : res.statusText);
        return;
      }
      setValues({
        takePrimaryTechnical:
          Number(data.takePrimaryTechnical) || values.takePrimaryTechnical,
        takePrimarySimple:
          Number(data.takePrimarySimple) || values.takePrimarySimple,
        takeDiameterRescue:
          Number(data.takeDiameterRescue) || values.takeDiameterRescue,
      });
      setMessage(
        'Đã lưu. Giá trị được ghi vào data/search-retrieval-settings.json.',
      );
    } catch {
      setError('Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Cài đặt retrieval
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Giới hạn <span className="font-mono text-slate-700">take</span> trong{' '}
          <span className="font-mono text-xs text-slate-600">
            search-service.ts
          </span>
          : truy vấn chính và nhánh cứu diameter.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-5 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              takePrimarySimple{' '}
              <span className="font-normal text-slate-500">
                (needsTechnicalPass === false)
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={500000}
              required
              value={values.takePrimarySimple}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takePrimarySimple: Number(e.target.value) || 0,
                }))
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              takePrimaryTechnical{' '}
              <span className="font-normal text-slate-500">
                (needsTechnicalPass === true)
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={500000}
              required
              value={values.takePrimaryTechnical}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takePrimaryTechnical: Number(e.target.value) || 0,
                }))
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              takeDiameterRescue
            </span>
            <input
              type="number"
              min={1}
              max={500000}
              required
              value={values.takeDiameterRescue}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takeDiameterRescue: Number(e.target.value) || 0,
                }))
              }
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </form>
      )}

      {message ? (
        <p
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          role="status"
        >
          {message}
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
