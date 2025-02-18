import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { P5, AudioIn, FFT } from './types/p5'

interface MicrophoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelect: (deviceId: string) => void;
  devices: MediaDeviceInfo[];
  selectedDevice: string;
  onDeviceChange: (deviceId: string) => void;
  error?: string;
}

const MicrophoneModal = ({
  isOpen,
  onClose,
  onDeviceSelect,
  devices,
  selectedDevice,
  onDeviceChange,
  error
}: MicrophoneModalProps) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 mr-3">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" fill="#4285F4"/>
              <path d="M17.91 11C17.91 11.41 17.87 11.8 17.82 12.18C17.72 12.9 18.26 13.5 18.98 13.5H19.04C19.52 13.5 19.93 13.15 20.03 12.68C20.11 12.27 20.15 11.84 20.15 11.4C20.15 7.74 17.89 4.61 14.69 3.36C14.25 3.19 13.8 3.5 13.8 3.97V4.04C13.8 4.41 14.03 4.73 14.35 4.89C16.89 5.96 18.71 8.31 18.71 11H17.91Z" fill="#4285F4"/>
              <path d="M6.09 11C6.09 8.31 7.91 5.96 10.45 4.89C10.77 4.73 11 4.41 11 4.04V3.97C11 3.5 10.55 3.19 10.11 3.36C6.91 4.61 4.65 7.74 4.65 11.4C4.65 11.84 4.69 12.27 4.77 12.68C4.87 13.15 5.28 13.5 5.76 13.5H5.82C6.54 13.5 7.08 12.9 6.98 12.18C6.93 11.8 6.09 11.41 6.09 11Z" fill="#4285F4"/>
              <path d="M12 16.5C9.11 16.5 6.75 14.15 6.75 11.25C6.75 10.84 6.41 10.5 6 10.5H5.94C5.52 10.5 5.19 10.84 5.19 11.25C5.19 14.97 8.28 18 12 18C15.72 18 18.81 14.97 18.81 11.25C18.81 10.84 18.48 10.5 18.06 10.5H18C17.59 10.5 17.25 10.84 17.25 11.25C17.25 14.15 14.89 16.5 12 16.5Z" fill="#4285F4"/>
              <path d="M12 20C11.45 20 11 20.45 11 21V22C11 22.55 11.45 23 12 23C12.55 23 13 22.55 13 22V21C13 20.45 12.55 20 12 20Z" fill="#4285F4"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold">マイクへのアクセス</h2>
        </div>
        {error ? (
          <p className="text-red-500 mb-4">{error}</p>
        ) : (
          <>
            <p className="text-gray-600 mb-4">このサイトがマイクを使用できるようにしますか？</p>
            {devices.length > 0 && (
              <select 
                value={selectedDevice} 
                onChange={(e) => onDeviceChange(e.target.value)}
                className="w-full p-2 mb-4 border rounded"
              >
                {devices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `マイク ${device.deviceId.slice(0, 4)}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            ブロック
          </button>
          <button
            onClick={() => onDeviceSelect(selectedDevice)}
            className="px-4 py-2 bg-[#4285F4] text-white rounded hover:bg-[#3367D6]"
            disabled={!!error || devices.length === 0}
          >
            許可
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const [showModal, setShowModal] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [error, setError] = useState<string>('')
  
  const sketchRef = useRef<HTMLDivElement>(null)
  const mic = useRef<AudioIn | null>(null)
  const fft = useRef<FFT | null>(null)
  const p5Instance = useRef<P5 | null>(null)
  const particles = useRef<Particle[]>([])
  const baseHue = useRef(0)

  // Get available audio devices
  useEffect(() => {
    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(device => device.kind === 'audioinput')
        setAudioDevices(audioInputs)
        if (audioInputs.length > 0 && !selectedDevice) {
          setSelectedDevice(audioInputs[0].deviceId)
        }
      } catch (err) {
        setError('デバイスの列挙中にエラーが発生しました')
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    handleDeviceChange()

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [])



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
    setError('')
    setShowModal(true)
  }

  const handleDeviceSelect = async () => {
    if (!p5Instance.current || !selectedDevice) return
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedDevice } }
      })
      
      const p = p5Instance.current
      await p.userStartAudio()
      mic.current = new (p as any).AudioIn() as AudioIn
      
      if (mic.current) {
        await mic.current.start()
        fft.current = new (p as any).FFT(1024) as FFT
        if (fft.current && mic.current) {
          fft.current.setInput(mic.current)
          setIsListening(true)
          setShowModal(false)
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
                マイクをオンにする
              </button>
            )}
          </div>
        </div>
      </div>
      <MicrophoneModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setError('')
        }}
        onDeviceSelect={handleDeviceSelect}
        devices={audioDevices}
        selectedDevice={selectedDevice}
        onDeviceChange={setSelectedDevice}
        error={error}
      />
    </div>
  )
}

export default App
