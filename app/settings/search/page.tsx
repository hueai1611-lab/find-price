'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type Settings = {
  takePrimaryTechnical: number;
  takePrimarySimple: number;
  takeDiameterRescue: number;
};

export default function SearchRetrievalSettingsPage() {
  const [values, setValues] = useState<Settings>({
    takePrimarySimple: 20,
    takePrimaryTechnical: 250,
    takeDiameterRescue: 400,
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
    <div className="mx-auto max-w-lg px-4 py-8 text-sm text-zinc-900">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Cài đặt — Search retrieval</h1>
        <Link href="/search" className="text-blue-700 underline">
          ← Search
        </Link>
      </div>
      <p className="mb-4 text-xs text-zinc-600">
        Ba giới hạn <span className="font-mono">take</span> trong{' '}
        <span className="font-mono">lib/search/search-service.ts</span>: truy
        vấn chính (có / không technical pass) và nhánh cứu diameter.
      </p>

      {loading ? (
        <p className="text-zinc-500">Đang tải…</p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 border border-zinc-300 bg-zinc-50 p-4"
        >
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">
              takePrimarySimple{' '}
              <span className="font-normal text-zinc-500">
                (needsTechnicalPass === false)
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              required
              value={values.takePrimarySimple}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takePrimarySimple: Number(e.target.value) || 0,
                }))
              }
              className="border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">
              takePrimaryTechnical{' '}
              <span className="font-normal text-zinc-500">
                (needsTechnicalPass === true)
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              required
              value={values.takePrimaryTechnical}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takePrimaryTechnical: Number(e.target.value) || 0,
                }))
              }
              className="border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">
              takeDiameterRescue
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              required
              value={values.takeDiameterRescue}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  takeDiameterRescue: Number(e.target.value) || 0,
                }))
              }
              className="border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-fit border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </form>
      )}

      {message ? (
        <p className="mt-3 text-xs text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
