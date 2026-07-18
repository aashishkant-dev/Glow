import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Glow — Verified Home Care in Sudbury'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#000000',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          padding: '60px',
        }}
      >
        <div
          style={{
            color: '#0066FF',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 4,
            marginBottom: 24,
          }}
        >
          GLOW
        </div>
        <div
          style={{
            color: 'white',
            fontSize: 64,
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Care, delivered to your door.
        </div>
        <div
          style={{
            color: '#8E8E93',
            fontSize: 24,
            textAlign: 'center',
          }}
        >
          Verified Providers in Greater Sudbury · Starting at $25/hr
        </div>
      </div>
    ),
    { ...size }
  )
}
