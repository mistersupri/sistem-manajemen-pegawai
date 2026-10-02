import { z } from 'zod';
import { body, route } from '@/lib/api';
import { faceAttendance } from '@/lib/services/attendance';

export const POST = route({ perm: 'attendance.self' }, async ({ req, actor }) => faceAttendance(actor, 'FACE_SELF', await body(req, z.unknown()), req.headers.get('user-agent')));
