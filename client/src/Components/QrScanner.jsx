import React, { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import '../styles/caseta.css'

// Escáner de QR con la cámara del dispositivo.
//
// jsQR trabaja sobre píxeles, así que el flujo es: getUserMedia → <video> →
// volcar cada fotograma a un <canvas> → leer los píxeles → decodificar.
//
// Se usa requestAnimationFrame y no setInterval para que el bucle se pause solo
// cuando la pestaña pasa a segundo plano; con setInterval seguiría gastando
// batería en el móvil del vigilante con la caseta abierta todo el turno.
export function QrScanner({ onLeer, activo = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const streamRef = useRef(null)

  // Un QR permanece en cuadro durante muchos fotogramas seguidos. Sin esta
  // bandera se dispararían decenas de registros de entrada por cada escaneo.
  const yaLeidoRef = useRef(false)

  // El manejador vive en una ref para que el bucle no se recree en cada render.
  const onLeerRef = useRef(onLeer)
  onLeerRef.current = onLeer

  const [error, setError] = useState(null)
  const [listo, setListo] = useState(false)

  const bucle = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const codigo = jsQR(imagen.data, imagen.width, imagen.height, {
        inversionAttempts: 'dontInvert',
      })

      if (codigo?.data && !yaLeidoRef.current) {
        yaLeidoRef.current = true
        onLeerRef.current?.(codigo.data)
        return // se detiene hasta que se pida escanear otro
      }
    }

    rafRef.current = requestAnimationFrame(bucle)
  }, [])

  useEffect(() => {
    if (!activo) return

    let cancelado = false
    yaLeidoRef.current = false

    async function iniciar() {
      try {
        // facingMode 'environment' pide la cámara trasera en móvil, que es la
        // que apunta al código del residente.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelado) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', 'true') // iOS: sin esto abre a pantalla completa
        await video.play()
        setListo(true)
        bucle()
      } catch (err) {
        if (cancelado) return
        setError(
          err.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Actívalo en el navegador para poder escanear.'
            : err.name === 'NotFoundError'
              ? 'No se encontró ninguna cámara en este dispositivo.'
              : `No se pudo abrir la cámara: ${err.message}`
        )
      }
    }

    iniciar()

    return () => {
      cancelado = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setListo(false)
    }
  }, [activo, bucle])

  const escanearOtro = () => {
    yaLeidoRef.current = false
    bucle()
  }

  if (error) {
    return (
      <div className="scanner-error">
        <p>{error}</p>
        <p className="campo-ayuda">
          Si no puedes usar la cámara, registra la entrada manualmente desde la caseta.
        </p>
      </div>
    )
  }

  return (
    <div className="scanner-wrap">
      <video ref={videoRef} className="scanner-video" muted playsInline />
      <div className="scanner-marco" aria-hidden="true" />
      <canvas ref={canvasRef} hidden />
      {!listo && <p className="scanner-estado">Abriendo la cámara…</p>}
      <button type="button" className="scanner-reintentar" onClick={escanearOtro}>
        Escanear otro
      </button>
    </div>
  )
}
