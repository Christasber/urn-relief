import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const { urnId, params, imageDataUrl } = body

  if (!urnId || !imageDataUrl) {
    return NextResponse.json({ error: 'Missing urnId or image' }, { status: 400 })
  }

  // make order id
  const orderId = crypto.randomUUID()
  const dir = path.join(process.cwd(), 'public', 'outputs', orderId)
  await fs.mkdir(dir, { recursive: true })

  // save input image
  const base64 = imageDataUrl.split(',')[1]
  await fs.writeFile(path.join(dir, 'image.png'), Buffer.from(base64, 'base64'))

  // drop job file for worker
  const jobsDir = path.join(process.cwd(), '.jobs')
  await fs.mkdir(jobsDir, { recursive: true })
  await fs.writeFile(
    path.join(jobsDir, `${orderId}.json`),
    JSON.stringify({ orderId, urnId, params, imagePath: path.join(dir, 'image.png'), outDir: dir }, null, 2)
  )

  return NextResponse.json({ ok: true, order_id: orderId })
}
