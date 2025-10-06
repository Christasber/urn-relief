import './globals.css'
export const metadata = { title: 'Photo-to-Relief Urn Designer' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
