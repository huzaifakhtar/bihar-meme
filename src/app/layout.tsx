import './globals.css'
import React from 'react'

export const metadata = {
  title: 'Bihari ko Bajaao',
  description: 'Playful slap meter prototype',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body>
        <div className="max-w-3xl mx-auto p-6">{children}</div>
      </body>
    </html>
  )
}
