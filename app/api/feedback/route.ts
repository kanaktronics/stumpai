import { NextResponse } from 'next/server';

// Feedback feature has been removed.
// This stub prevents build failures caused by missing UPSTASH env vars.
export async function POST() {
  return NextResponse.json({ success: false, message: 'Feature deprecated.' }, { status: 410 });
}
