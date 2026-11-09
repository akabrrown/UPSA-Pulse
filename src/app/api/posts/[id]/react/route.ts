import { NextRequest } from 'next/server';
import { dbTogglePostReaction } from '@/lib/db/postgres';
import {
  apiError,
  apiSuccess,
  getAuthenticatedUserId,
  mapDomainErrorToResponse,
} from '@/lib/api-helpers';

const ALLOWED_EMOJIS = new Set(['🔥', '😂', '❤️', '💡', '👏', '😮']);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = getAuthenticatedUserId(req);

    const body = await req.json();
    const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : '';

    if (!ALLOWED_EMOJIS.has(emoji)) {
      return apiError('invalid_emoji', 'Supported reactions are 🔥, 😂, ❤️, 💡, 👏, 😮', 400);
    }

    const result = await dbTogglePostReaction(userId, id, emoji);
    return apiSuccess(result);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
