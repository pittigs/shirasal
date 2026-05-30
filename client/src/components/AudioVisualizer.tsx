import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isMuted: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isMuted }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas auflösen
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 80;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    let phase = 0; // Für Idle-Animation

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      // Transparenten Hintergrund zeichnen, um Glow-Effekte zu unterstützen
      ctx.clearRect(0, 0, width, height);

      // Akzentfarbe aus den CSS-Variablen auslesen
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#8b5cf6';
      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '139, 92, 246';

      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `rgba(${accentRgb}, 0.5)`;
      ctx.beginPath();

      if (analyser && !isMuted) {
        // Echtzeit-Daten (Time-Domain für Oszilloskop-Welle) abrufen
        analyser.getByteTimeDomainData(dataArray);

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0; // Normalisieren auf 0.0 - 2.0
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }
      } else {
        // Idle-Sinuswelle zeichnen, wenn stummgeschaltet oder kein Analyser vorhanden
        phase += 0.08;
        const amplitude = isMuted ? 1 : 3; // Sehr klein bei Mute, leicht bewegt sonst
        
        ctx.moveTo(0, height / 2);
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.02 + phase) * amplitude;
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [analyser, isMuted]);

  return (
    <div style={{ width: '100%', overflow: 'hidden', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', padding: '6px' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '80px' }} />
    </div>
  );
};
