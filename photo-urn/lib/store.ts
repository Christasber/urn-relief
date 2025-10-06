import { create } from 'zustand'

type UrnId = 'urn_vertical' | 'urn_horizontal'

export type PreviewParams = {
  scale: number
  offsetX: number
  offsetY: number
  rotation: number
  depth: number
  invert: boolean
}

type State = {
  step: 1 | 2 | 3
  setStep: (s: 1 | 2 | 3) => void
  urnId: UrnId | null
  setUrnId: (id: UrnId) => void
  imageDataUrl: string | null
  setImageDataUrl: (d: string | null) => void
  orderId: string | null
  setOrderId: (id: string) => void
  params: PreviewParams
  setParams: (p: Partial<PreviewParams>) => void
}

export const useAppStore = create<State>((set) => ({
  step: 1, setStep: (s) => set({ step: s }),
  urnId: null, setUrnId: (id) => set({ urnId: id }),
  imageDataUrl: null, setImageDataUrl: (d) => set({ imageDataUrl: d }),
  orderId: null, setOrderId: (id) => set({ orderId: id }),
  params: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, depth: 1.8, invert: false },
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
}))
