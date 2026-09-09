import { NextResponse } from 'next/server';
import { getTunnelUrl } from '@/server/tunnelStore';

export const dynamic = 'force-dynamic';

export function GET() {
  const url = getTunnelUrl();
  return NextResponse.json({ url });
}
