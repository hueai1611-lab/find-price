import { NextResponse } from 'next/server';

import {
  getSearchRetrievalSettings,
  mergeSearchRetrievalSettings,
  saveSearchRetrievalSettings,
  type SearchRetrievalSettings,
} from '@/lib/search/search-retrieval-settings';

export async function GET() {
  return NextResponse.json(getSearchRetrievalSettings());
}

type PostBody = Partial<SearchRetrievalSettings>;

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const hasAny =
    body.takePrimaryTechnical !== undefined ||
    body.takePrimarySimple !== undefined ||
    body.takeDiameterRescue !== undefined;
  if (!hasAny) {
    return NextResponse.json(
      { error: 'provide at least one of takePrimaryTechnical, takePrimarySimple, takeDiameterRescue' },
      { status: 400 },
    );
  }

  const next = mergeSearchRetrievalSettings(body);
  saveSearchRetrievalSettings(next);
  return NextResponse.json(next);
}
