import { NextRequest } from 'next/server';
import { dbDecideAppeal } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

async function handleDecide(req: NextRequest) {
  try {
    const actorUserId = getAuthenticatedUserId(req);
    const body = await req.json();
    const appealId = Number(body.appealId);
    const decision = body.decision;
    const note = (typeof body.note === 'string' ? body.note : typeof body.decisionNote === 'string' ? body.decisionNote : '').trim();

    if (!appealId || (decision !== 'upheld' && decision !== 'rejected') || note.length < 5) {
      return apiError('validation_error', 'Enter a valid appeal ID, decision (upheld/rejected), and note (min 5 chars).', 400);
    }

    const decided = await dbDecideAppeal(actorUserId, {
      appealId,
      decision,
      note,
    });
    return apiSuccess(decided, 200);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function POST(req: NextRequest) {
  return handleDecide(req);
}

export async function PATCH(req: NextRequest) {
  return handleDecide(req);
}

