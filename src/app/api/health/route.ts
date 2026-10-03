import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Health check untuk Docker/load balancer: proses hidup dan database terjangkau.
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'ok', latencyMs: Date.now() - started });
  } catch {
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }
}
