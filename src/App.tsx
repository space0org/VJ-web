import React, { useEffect, useRef, useState } from 'react'
import './App.css'
import type { P5, AudioIn, FFT } from './types/p5'

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
}

function App() {
  const [isListening, setIsListening] = useState(false)
  const sketchRef = useRef<HTMLDivElement>(null)
  const mic = useRef<AudioIn | null>(null)
  const fft = useRef<FFT | null>(null)
  const p5Instance = useRef<P5 | null>(null)
  const particles = useRef<Particle[]>([])
  const baseHue = useRef(0)

  // Auto-initialize audio on mount
  useEffect(() => {
    const initAudio = async () => {
      await loadP5()
      const p5Instance = new (window as any).p5(() => {}, document.createElement('div')) as P5
      await p5Instance.userStartAudio()
      p5Instance.remove()
    }
    initAudio()
  }, [])

  useEffect(() => {
    if (!sketchRef.current) return
    
    // Load p5.js and p5.sound before initializing sketch
    loadP5().then(async () => {
      await startAudio()

    const sketch = (p: P5) => {
      p.setup = () => {
        p.createCanvas(window.innerWidth, window.innerHeight)
        p.colorMode(p.HSB)
        p.background(0)
        p.frameRate(60)

        // Handle both touch and mouse interactions
        const handleInteraction = () => {
          const energy = fft.current?.getEnergy('mid') || 150
          const touchCount = p.touches.length || 1
          
          for (let i = 0; i < 8 * touchCount; i++) {
            const touch = p.touches[0] as { x: number; y: number }
            const x = p.touches.length > 0 ? touch.x : p.mouseX
            const y = p.touches.length > 0 ? touch.y : p.mouseY
            createParticle(x, y, energy)
          }
          return false // Prevent default
        }

        p.touchStarted = handleInteraction
        p.touchMoved = handleInteraction
        p.mousePressed = handleInteraction
        p.mouseDragged = handleInteraction
      }

      const createParticle = (x: number, y: number, energy: number) => {
        const angle = p.random(p.TWO_PI)
        const speed = p.map(energy, 0, 255, 2, 6)
        const spread = p.map(energy, 0, 255, 5, 30)
        const distanceFromCenter = p.random(spread)
        const particleAngle = p.random(p.TWO_PI)
        const maxLife = p.random(50, 150)
        
        particles.current.push({
          x: x + Math.cos(particleAngle) * distanceFromCenter,
          y: y + Math.sin(particleAngle) * distanceFromCenter,
          size: p.map(energy, 0, 255, 2, 6),
          hue: (baseHue.current + p.random(-15, 15)) % 360,
          speed,
          angle,
          life: maxLife,
          maxLife,
          sizeVariation: p.random(0.5, 2)
        })
      }

      p.draw = () => {
        p.background(0, 0, 0, 0.1)
        
        if (isListening && fft.current) {
          const energy = fft.current.getEnergy('mid')
          
          // Create particles based on audio energy
          if (energy > 100) {
            for (let i = 0; i < 5; i++) {
              createParticle(
                p.random(p.width),
                p.random(p.height),
                energy
              )
            }
          }
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

          // Calculate size and opacity based on life
          const lifeRatio = particle.life / particle.maxLife
          const currentSize = particle.size * 
            (1 + Math.sin(lifeRatio * Math.PI) * particle.sizeVariation)
          const alpha = lifeRatio * 0.8

          // Draw particle with glow effect
          p.noStroke()
          // Outer glow
          p.fill(particle.hue, 80, 100, alpha * 0.2)
          p.circle(particle.x, particle.y, currentSize * 2)
          // Inner particle
          p.fill(particle.hue, 100, 100, alpha)
          p.circle(particle.x, particle.y, currentSize)
          
          return true
        })

        // Slowly shift base hue for rainbow effect
        baseHue.current = (baseHue.current + 0.5) % 360
      }

      p.windowResized = () => {
        p.resizeCanvas(window.innerWidth, window.innerHeight)
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
      const p = p5Instance.current
      await p.userStartAudio()
      // Create audio input with proper type casting
      mic.current = new (p as any).AudioIn() as AudioIn
      if (mic.current) {
        await mic.current.start()
        // Create FFT analyzer with proper type casting
        fft.current = new (p as any).FFT(1024) as FFT
        if (fft.current && mic.current) {
          fft.current.setInput(mic.current)
          setIsListening(true)
        }
      }
    } catch (error) {
      console.error('Error accessing microphone:', error)
    }
  }

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-black overflow-hidden">
      <div ref={sketchRef} className="flex-1 min-h-0" />
      <div className="w-full h-[160px] shrink-0 bg-white flex flex-col items-center justify-center gap-4 border-t border-gray-200 shadow-lg">
        <div className="w-full max-w-lg px-6 flex flex-col items-center gap-4">
          <p className="text-base text-gray-700 text-center">© 2025 VJ Web App. All rights reserved.</p>
          {!isListening && (
            <button
            onClick={startAudio}
            className="w-full max-w-[300px] bg-black text-white text-xl py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
            style={{ 
              touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none'
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            マイクをオンにする
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
