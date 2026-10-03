import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Jam server untuk jam kiosk dan stempel foto dinas luar (jangan percaya jam perangkat).
export async function GET() {
  const s = await getSettings();
  return NextResponse.json({ now: new Date().toISOString(), timezone: s['org.timezone'], label: s['org.timezoneLabel'] }, { headers: { 'Cache-Control': 'no-store' } });
}
