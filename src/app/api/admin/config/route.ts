import { NextRequest } from 'next/server';
import { adminConfigUpdateSchema } from '@/lib/validation/schemas';
import { dbGetAdminConfig, dbUpdateAdminConfig } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const actorId = getAuthenticatedUserId(req);
    const config = await dbGetAdminConfig(actorId);
    return apiSuccess(config);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // Resilient payload normalizer: support both { section, payload } and legacy top-level action objects
    let normalized = body;
    if (typeof body === 'object' && body !== null) {
      if (body.addKeywordRule) {
        normalized = { section: 'keyword_rule', payload: body.addKeywordRule };
      } else if (body.addAllowedDomain) {
        normalized = {
          section: 'allowed_domain',
          payload: typeof body.addAllowedDomain === 'string' ? { domain: body.addAllowedDomain } : body.addAllowedDomain,
        };
      } else if (body.zoneAccuracyGate) {
        normalized = {
          section: 'zone',
          payload: {
            id: body.zoneAccuracyGate.zoneId,
            maxAccuracyMeters: body.zoneAccuracyGate.maxAccuracyMeters,
          },
        };
      } else if (body.toggleZoneActive) {
        normalized = {
          section: 'zone',
          payload: {
            id: body.toggleZoneActive.zoneId,
            isActive: body.toggleZoneActive.isActive,
          },
        };
      } else if (body.addZoneGeoJson) {
        normalized = {
          section: 'zone',
          payload: {
            name: body.addZoneGeoJson.name,
            maxAccuracyMeters: body.addZoneGeoJson.maxAccuracyMeters,
            geojson: body.addZoneGeoJson.geoJson ?? body.addZoneGeoJson.geojson,
            isActive: true,
          },
        };
      } else if (body.updateChannel) {
        normalized = {
          section: 'channel',
          payload: {
            id: body.updateChannel.channelId,
            ...body.updateChannel,
          },
        };
      } else if (body.addChannel) {
        normalized = {
          section: 'channel',
          payload: body.addChannel,
        };
      }
    }

    const parsed = adminConfigUpdateSchema.safeParse(normalized);
    if (!parsed.success) {
      return apiError('invalid_input', 'Invalid configuration update payload.', 400);
    }

    const actorId = getAuthenticatedUserId(req);
    const updated = await dbUpdateAdminConfig(actorId, parsed.data);
    return apiSuccess(updated);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export const PATCH = PUT;
