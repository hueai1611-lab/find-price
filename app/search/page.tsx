"use client";

import { useState, type FormEvent } from "react";
import type { SearchResult } from "@/lib/search/search-types";

type ApiErrorBody = { error?: string };

function dash(s: string | null | undefined) {
  const t = (s ?? "").trim();
  return t ? t : "—";
}

export default function SearchToolPage() {
  const [query, setQuery] = useState("");
  const [pricePeriodCode, setPricePeriodCode] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ query: query.trim() });
      const p = pricePeriodCode.trim();
      if (p) params.set("pricePeriodCode", p);

      const res = await fetch(`/api/search?${params.toString()}`);
      const data: { results?: SearchResult[] } & ApiErrorBody = await res.json();

      if (!res.ok) {
        setResults([]);
        setError(typeof data.error === "string" ? data.error : res.statusText);
        return;
      }

      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setResults([]);
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-zinc-900">
      <h1 className="mb-6 text-lg font-semibold">Search</h1>

      <form onSubmit={onSubmit} className="mb-6 flex flex-col gap-3 border border-zinc-300 bg-zinc-50 p-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-700">Query</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-zinc-300 bg-white px-2 py-1.5"
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-700">pricePeriodCode</span>
          <select
            value={pricePeriodCode}
            onChange={(e) => setPricePeriodCode(e.target.value)}
            className="max-w-xs border border-zinc-300 bg-white px-2 py-1.5"
          >
            <option value="">—</option>
            <option value="Q1_2026">Q1_2026</option>
            <option value="Q2_2026">Q2_2026</option>
            <option value="Q3_2026">Q3_2026</option>
            <option value="Q4_2026">Q4_2026</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-fit border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

      {error ? (
        <p className="mb-4 border border-red-300 bg-red-50 px-2 py-1.5 text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      <h2 className="mb-2 font-medium text-zinc-700">Results</h2>
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.itemId} className="border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-800">
            <div className="mb-1 text-zinc-500">{dash(r.confidenceLabel)}</div>
            <div>
              <span className="text-zinc-500">noiDungCongViec</span> {dash(r.noiDungCongViec)}
            </div>
            <div>
              <span className="text-zinc-500">nhomCongTac</span> {dash(r.nhomCongTac)}
            </div>
            <div>
              <span className="text-zinc-500">donVi</span> {dash(r.donVi)}
            </div>
            <div>
              <span className="text-zinc-500">pricePeriodLabel</span> {dash(r.pricePeriodLabel)}
            </div>
            <div>
              <span className="text-zinc-500">thiCong</span> {dash(r.thiCong)}
            </div>
            <div>
              <span className="text-zinc-500">tongCong</span> {dash(r.tongCong)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
