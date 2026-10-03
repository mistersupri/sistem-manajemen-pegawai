import { z } from 'zod';
import { body, publicRoute } from '@/lib/api';
import { requestMeta } from '@/lib/auth/session';
import { stationAttendance } from '@/lib/services/stations';

// Rekam wajah dari titik absen tanpa login. Token di URL adalah satu-satunya kredensial.
export const POST = publicRoute<{ token: string }>(async ({ req, params }) => stationAttendance(params.token, 'kiosk', await body(req, z.unknown()), await requestMeta()));
