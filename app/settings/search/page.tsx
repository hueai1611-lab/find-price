import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  getAppSettings,
  setQuarterMasterSharedRootPath,
} from '@/lib/settings/app-settings';
import {
  getSearchRetrievalSettings,
  mergeSearchRetrievalSettings,
  saveSearchRetrievalSettings,
} from '@/lib/search/search-retrieval-settings';

type Settings = {
  takePrimaryTechnical: number;
  takePrimarySimple: number;
  takeDiameterRescue: number;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

export default async function SearchRetrievalSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  async function saveSharedRootAction(formData: FormData) {
    'use server';
    const v = String(formData.get('quarterMasterSharedRootPath') ?? '');
    await setQuarterMasterSharedRootPath(v);
    redirect('/settings/search?saved=sharedRoot');
  }

  async function saveRetrievalAction(formData: FormData) {
    'use server';
    const partial: Partial<Settings> = {
      takePrimarySimple: Number(formData.get('takePrimarySimple') ?? NaN),
      takePrimaryTechnical: Number(formData.get('takePrimaryTechnical') ?? NaN),
      takeDiameterRescue: Number(formData.get('takeDiameterRescue') ?? NaN),
    };
    const merged = mergeSearchRetrievalSettings(partial);
    saveSearchRetrievalSettings(merged);
    redirect('/settings/search?saved=retrieval');
  }

  const currentRetrieval = getSearchRetrievalSettings();
  const appSettings = await getAppSettings();
  const saved = typeof searchParams?.saved === 'string' ? searchParams.saved : '';

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

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Quarter master path (shared)
        </h2>
        <form
          action={saveSharedRootAction}
          className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              quarterMasterSharedRootPath
            </span>
            <input
              name="quarterMasterSharedRootPath"
              placeholder="\\10.100.58.35\\p.ktxd$\\2.HSMT_NS\\NS\\1\\"
              defaultValue={appSettings.quarterMasterSharedRootPath}
              className={inputClass}
            />
            <span className="text-xs text-slate-600">
              Root thư mục UNC chứa file đơn giá quý (source of truth). Hệ thống sẽ
              nối thêm tên file workbook theo batch import.
            </span>
          </label>
          <button
            type="submit"
            className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Lưu
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Retrieval limits
        </h2>
        <form
          action={saveRetrievalAction}
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
              name="takePrimarySimple"
              type="number"
              min={1}
              max={500000}
              required
              defaultValue={currentRetrieval.takePrimarySimple}
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
              name="takePrimaryTechnical"
              type="number"
              min={1}
              max={500000}
              required
              defaultValue={currentRetrieval.takePrimaryTechnical}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-800">
              takeDiameterRescue
            </span>
            <input
              name="takeDiameterRescue"
              type="number"
              min={1}
              max={500000}
              required
              defaultValue={currentRetrieval.takeDiameterRescue}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
          >
            Lưu
          </button>
        </form>
      </section>

      {saved === 'sharedRoot' ? (
        <p
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          role="status"
        >
          Đã lưu quarterMasterSharedRootPath.
        </p>
      ) : null}
      {saved === 'retrieval' ? (
        <p
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          role="status"
        >
          Đã lưu. Giá trị được ghi vào data/search-retrieval-settings.json.
        </p>
      ) : null}
    </main>
  );
}
