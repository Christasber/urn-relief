'use client'
import { useRef, useState } from 'react'
import ThreePreview from '@/components/ThreePreview'
import { useAppStore } from '@/lib/store'
import urns from '@/lib/urns/urns.json'

export default function Home() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  const {
    step, setStep,
    imageDataUrl, setImageDataUrl,
    urnId, setUrnId,
    params, setParams
  } = useAppStore()

  const onFile = async (f: File) => {
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result as string)
    reader.readAsDataURL(f)
  }

  const currentUrn: any = (urnId && (urns as any)[urnId]) || null
  const dMin = currentUrn?.target?.depth_mm_min ?? 0.8
  const dMax = currentUrn?.target?.depth_mm_max ?? 2.5

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!urnId || !imageDataUrl) {
      alert('Please upload an image and choose an urn first.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urnId,
          params,
          imageDataUrl,
          customer: {
            name: customerName.trim(),
            address: customerAddress.trim()
          }
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to submit')
      alert('Submitted! We’ll follow up with payment & download links.')
      // Reset or advance step
      setStep(1)
      setImageDataUrl(null as any)
      setUrnId(undefined as any)
      setCustomerName('')
      setCustomerAddress('')
    } catch (err: any) {
      console.error(err)
      alert(`Submit error: ${err.message || err}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Photo → Relief → Urn Preview</h1>

      {/* Step 1: Upload */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">1) Upload Photo</h2>
          <button
            className="px-3 py-1.5 rounded-md border text-sm"
            onClick={() => fileRef.current?.click()}
          >
            Choose Image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
        </div>
        {imageDataUrl ? (
          <p className="mt-2 text-sm text-green-700">Image loaded ✓</p>
        ) : (
          <p className="mt-2 text-sm text-neutral-600">No image selected yet.</p>
        )}
      </section>

      {/* Step 2: Choose urn */}
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-medium mb-3">2) Choose Urn</h2>
        <div className="flex gap-3">
          <button
            className={`px-3 py-2 rounded-md border ${urnId === 'urn_vertical' ? 'bg-black text-white' : ''}`}
            onClick={() => setUrnId('urn_vertical' as any)}
          >
            {((urns as any).urn_vertical?.label) || 'Vertical Urn'}
          </button>
          <button
            className={`px-3 py-2 rounded-md border ${urnId === 'urn_horizontal' ? 'bg-black text-white' : ''}`}
            onClick={() => setUrnId('urn_horizontal' as any)}
          >
            {((urns as any).urn_horizontal?.label) || 'Horizontal Urn'}
          </button>
        </div>
        {urnId ? (
          <p className="mt-2 text-sm text-green-700">Selected: {(urns as any)[urnId]?.label} ✓</p>
        ) : (
          <p className="mt-2 text-sm text-neutral-600">No urn selected yet.</p>
        )}
      </section>

      {/* Step 3: Preview & controls */}
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-medium mb-3">3) Adjust Relief & Preview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="order-2 md:order-1 space-y-3">
            <div>
              <label className="block text-sm font-medium">Scale</label>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.01}
                value={params.scale}
                onChange={(e) => setParams({ scale: parseFloat(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium">Offset X (mm)</label>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={0.5}
                  value={params.offsetX}
                  onChange={(e) => setParams({ offsetX: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Offset Y (mm)</label>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={0.5}
                  value={params.offsetY}
                  onChange={(e) => setParams({ offsetY: parseFloat(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">Rotation (°)</label>
              <input
                type="range"
                min={-45}
                max={45}
                step={0.5}
                value={params.rotation}
                onChange={(e) => setParams({ rotation: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Depth (mm)</label>
              <input
                type="range"
                min={dMin}
                max={dMax}
                step={0.1}
                value={params.depth}
                onChange={(e) => setParams({ depth: parseFloat(e.target.value) })}
              />
              <div className="mt-1 text-xs text-neutral-600">
                Range {dMin}–{dMax} mm
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="invert"
                type="checkbox"
                checked={!!params.invert}
                onChange={(e) => setParams({ invert: e.target.checked })}
              />
              <label htmlFor="invert" className="text-sm">Invert relief</label>
            </div>
          </div>

          <div className="order-1 md:order-2">
            <ThreePreview />
            <p className="text-xs text-neutral-500 mt-2">
              Tip: click-drag to rotate, scroll to zoom, right-drag to pan.
            </p>
          </div>
        </div>
      </section>

      {/* Step 4: Contact info & submit */}
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-medium mb-3">4) Your Details</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Full name</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Mailing address</label>
            <textarea
              required
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="123 Main St, City, State ZIP"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            <span className="text-xs text-neutral-600">
              We’ll email a payment link after review.
            </span>
          </div>
        </form>
      </section>
    </main>
  )
}
