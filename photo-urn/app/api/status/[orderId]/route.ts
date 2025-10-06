import { NextResponse } from 'next/server'
import path from 'node:path'
import { promises as fs } from 'node:fs'

export async function GET(_: Request, { params }: { params: { orderId: string } }) {
  const { orderId } = params
  const dir = path.join(process.cwd(), 'public', 'outputs', orderId)

  try {
    const files = await fs.readdir(dir)
    return NextResponse.json({
      order_id: orderId,
      ready: files.includes('relief_only.stl'),
      files: {
        depth_png: files.includes('depth.png') ? `/outputs/${orderId}/depth.png` : null,
        relief_stl: files.includes('relief_only.stl') ? `/outputs/${orderId}/relief_only.stl` : null,
        urn_final_stl: files.includes('urn_final.stl') ? `/outputs/${orderId}/urn_final.stl` : null,
      },
    })
  } catch {
    return NextResponse.json({ order_id: orderId, ready: false })
  }
}
