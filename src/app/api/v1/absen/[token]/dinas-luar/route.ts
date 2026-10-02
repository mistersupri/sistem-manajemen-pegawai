import { z } from 'zod';
import { body, publicRoute } from '@/lib/api';
import { requestMeta } from '@/lib/auth/session';
import { stationAttendance } from '@/lib/services/stations';

export const POST = publicRoute<{ token: string }>(async ({ req, params }) => stationAttendance(params.token, 'field-duty', await body(req, z.unknown()), await requestMeta()));
