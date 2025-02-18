import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { P5, AudioIn, FFT } from './types/p5'

// Audio frequency band configuration
const FREQUENCY_BANDS = {
  bass: { name: 'bass', threshold: 150, particleCount: 3 },
  lowMid: { name: 'lowMid', threshold: 130, particleCount: 4 },
  mid: { name: 'mid', threshold: 100, particleCount: 5 },
  highMid: { name: 'highMid', threshold: 90, particleCount: 6 },
  treble: { name: 'treble', threshold: 80, particleCount: 7 }
} as const;

// Load p5.js and p5.sound dynamically
const loadP5 = () => {
  return new Promise<void>((resolve) => {
    const p5Script = document.createElement('script')
    p5Script.src = 'https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js'
    p5Script.onload = () => {
      const soundScript = document.createElement('script')
      soundScript.src = 'https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/addons/p5.sound.min.js'
      soundScript.onload = () => resolve()
      document.head.appendChild(soundScript)
    }
    document.head.appendChild(p5Script)
  })
}

interface Particle {
  x: number
  y: number
  size: number
  hue: number
  speed: number
  angle: number
  life: number
  maxLife: number
  sizeVariation: number
  frequencyBand: keyof typeof FREQUENCY_BANDS
}

function App() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string>('')
  
  const sketchRef = useRef<HTMLDivElement>(null)
  const mic = useRef<AudioIn | null>(null)
  const fft = useRef<FFT | null>(null)
  const p5Instance = useRef<P5 | null>(null)
  const particles = useRef<Particle[]>([])
  const baseHue = useRef(0)

  // No need to enumerate devices - browser will handle device selection



  useEffect(() => {
    if (!sketchRef.current) return
    
    // Load p5.js and p5.sound before initializing sketch
    loadP5().then(async () => {
      await startAudio()

    const sketch = (p: P5) => {
      p.setup = () => {
        const canvasContainer = sketchRef.current?.getBoundingClientRect()
        if (canvasContainer) {
          p.createCanvas(canvasContainer.width, canvasContainer.height)
          p.colorMode(p.HSB)
          p.background(0)
          p.frameRate(60)
        }

        // Handle both touch and mouse interactions
        const handleInteraction = () => {
          const energy = fft.current?.getEnergy('mid') || 150
          const touchCount = p.touches.length || 1
          
          for (let i = 0; i < 8 * touchCount; i++) {
            const touch = p.touches[0] as { x: number; y: number }
            const x = p.touches.length > 0 ? touch.x : p.mouseX
            const y = p.touches.length > 0 ? touch.y : p.mouseY
            createParticle(x, y, energy, 'mid')
          }
          return false // Prevent default
        }

        p.touchStarted = handleInteraction
        p.touchMoved = handleInteraction
        p.mousePressed = handleInteraction
        p.mouseDragged = handleInteraction
      }

      const createParticle = (x: number, y: number, energy: number, band: keyof typeof FREQUENCY_BANDS = 'mid') => {
        const angle = p.random(p.TWO_PI)
        const speed = p.map(energy, 0, 255, 2, band === 'treble' ? 8 : 6)
        const spread = p.map(energy, 0, 255, 5, band === 'bass' ? 40 : 30)
        const distanceFromCenter = p.random(spread)
        const particleAngle = p.random(p.TWO_PI)
        const maxLife = p.random(50, band === 'bass' ? 200 : 150)
        
        particles.current.push({
          x: x + Math.cos(particleAngle) * distanceFromCenter,
          y: y + Math.sin(particleAngle) * distanceFromCenter,
          size: p.map(energy, 0, 255, 2, band === 'bass' ? 8 : 6),
          hue: (baseHue.current + p.random(-15, 15)) % 360,
          speed,
          angle,
          life: maxLife,
          maxLife,
          sizeVariation: p.random(0.5, band === 'bass' ? 3 : 2),
          frequencyBand: band
        })
      }

      p.draw = () => {
        p.background(0, 0, 0, 0.1)
        
        if (isListening && fft.current) {
          Object.entries(FREQUENCY_BANDS).forEach(([band, config]) => {
            const energy = fft.current!.getEnergy(config.name)
            if (energy > config.threshold) {
              for (let i = 0; i < config.particleCount; i++) {
                createParticle(
                  p.random(p.width),
                  p.random(p.height),
                  energy,
                  band as keyof typeof FREQUENCY_BANDS
                )
              }
            }
          })
        }

        // Update and draw particles
        particles.current = particles.current.filter(particle => {
          // Update position with slight turbulence
          const turbulence = p.noise(particle.x * 0.01, particle.y * 0.01, p.frameCount * 0.01) * 0.5
          particle.angle += turbulence - 0.25
          particle.x += Math.cos(particle.angle) * particle.speed
          particle.y += Math.sin(particle.angle) * particle.speed
          
          // Update life and check boundaries
          particle.life--
          if (particle.life <= 0 || 
              particle.x < 0 || particle.x > p.width || 
              particle.y < 0 || particle.y > p.height) {
            return false
          }

          // Calculate size and opacity based on life and frequency
          const lifeRatio = particle.life / particle.maxLife
          const currentSize = particle.size * 
            (1 + Math.sin(lifeRatio * Math.PI) * particle.sizeVariation)
          const alpha = lifeRatio * (particle.frequencyBand === 'bass' ? 0.9 : 0.8)

          // Draw particle with glow effect
          p.noStroke()
          // Outer glow
          p.fill(particle.hue, 
            particle.frequencyBand === 'treble' ? 90 : 80, 
            100, 
            alpha * 0.2)
          p.circle(particle.x, particle.y, currentSize * 2)
          // Inner particle
          p.fill(particle.hue, 
            particle.frequencyBand === 'treble' ? 100 : 90, 
            100, 
            alpha)
          p.circle(particle.x, particle.y, currentSize)
          
          return true
        })

        // Slowly shift base hue for rainbow effect
        baseHue.current = (baseHue.current + 0.5) % 360
      }

      p.windowResized = () => {
        const canvasContainer = sketchRef.current?.getBoundingClientRect()
        if (canvasContainer) {
          p.resizeCanvas(canvasContainer.width, canvasContainer.height)
        }
      }
    }

    // Cast p5 to P5 type since we know it's available globally
    p5Instance.current = new (window as any).p5(sketch, sketchRef.current) as P5
    return () => p5Instance.current?.remove()
    })
  }, [isListening])

  const startAudio = async () => {
    if (!p5Instance.current) return
    
    try {
      // Request microphone access using native browser dialog
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      const p = p5Instance.current
      await p.userStartAudio()
      mic.current = new (p as any).AudioIn() as AudioIn
      
      if (mic.current) {
        await mic.current.start()
        fft.current = new (p as any).FFT(1024) as FFT
        if (fft.current && mic.current) {
          fft.current.setInput(mic.current)
          setIsListening(true)
        }
      }
    } catch (err) {
      setError('マイクへのアクセスが拒否されました')
    }
  }

  return (
    <div>
      <div ref={sketchRef} className="canvas-container" />
      <div className="footer shadow-lg">
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 border-t border-gray-200">
          <div className="w-full max-w-lg px-6 flex flex-col items-center gap-4">
            <p className="text-base text-gray-700 text-center">© 2025 VJ Web App. All rights reserved.</p>
            {!isListening && (
              <button
                onClick={startAudio}
                className="w-full max-w-[300px] bg-black text-white text-xl py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                style={{ 
                  touchAction: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                  position: 'relative',
                  zIndex: 100
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                マイクをオンにする v1.0
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div className="fixed bottom-40 left-0 right-0 flex justify-center">
          <p className="bg-red-500 text-white px-4 py-2 rounded">{error}</p>
        </div>
      )}
    </div>
  )
}

export default App
