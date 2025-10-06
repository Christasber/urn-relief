import { NextRequest, NextResponse } from 'next/server'
export async function POST(req: NextRequest) {
  // Stub: enqueue HQ boolean union & export STL; return job id
  return NextResponse.json({ ok: true, job_id: 'stub-job' })
}
