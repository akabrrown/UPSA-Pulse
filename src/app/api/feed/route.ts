import { NextRequest } from 'next/server';
import { feedQuerySchema } from '@/lib/validation/schemas';
import { dbGetFeed } from '@/lib/db/postgres';
import { apiError, apiSuccess, getOptionalAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = feedQuerySchema.safeParse({
      sort: searchParams.get('sort') ?? 'hot',
      channelId: searchParams.get('channelId') ?? undefined,
      zoneId: searchParams.get('zoneId') ?? undefined,
      kind: searchParams.get('kind') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? 20,
    });

    if (!parsed.success) {
      return apiError('invalid_query', 'Invalid feed filter parameters.', 400);
    }

    const userId = getOptionalAuthenticatedUserId(req);
    const feed = await dbGetFeed({
      userId: userId ?? undefined,
      sort: parsed.data.sort,
      channelId: parsed.data.channelId,
      zoneId: parsed.data.zoneId,
      kind: parsed.data.kind,
      limit: parsed.data.limit,
    });

    return apiSuccess({
      items: feed.items,
      nextCursor: feed.nextCursor,
      zoneName: feed.zoneName,
      zones: feed.zones,
      channels: feed.channels,
    });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
