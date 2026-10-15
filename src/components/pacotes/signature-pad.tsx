'use client';

import * as React from 'react';
import { EraserIcon, Undo2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };
export type Stroke = Point[];

/**
 * Quadro de assinatura: mouse, toque e caneta (Pointer Events). Os traços ficam em coordenadas
 * relativas (0–1): girar a tela ou redimensionar redesenha a mesma assinatura em vez de apagá-la.
 */
export function SignaturePad({
  strokes,
  onChange,
  label = 'Quadro de assinatura',
}: {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  label?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef<Stroke | null>(null);
  const strokesRef = React.useRef(strokes);

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(rect.width * ratio) ||
      canvas.height !== Math.round(rect.height * ratio)
    ) {
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1c1c1e';
    const all = drawing.current ? [...strokesRef.current, drawing.current] : strokesRef.current;
    for (const stroke of all) {
      ctx.beginPath();
      stroke.forEach((p, i) => {
        const x = p.x * rect.width;
        const y = p.y * rect.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (stroke.length === 1)
        ctx.lineTo(stroke[0].x * rect.width + 0.1, stroke[0].y * rect.height);
      ctx.stroke();
    }
  }, []);

  React.useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="h-44 w-full cursor-crosshair touch-none rounded-xl bg-white ring-1 ring-black/15 sm:h-48"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = [point(event)];
          redraw();
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          drawing.current.push(point(event));
          redraw();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          const stroke = drawing.current;
          drawing.current = null;
          onChange([...strokesRef.current, stroke]);
        }}
        onPointerCancel={() => {
          drawing.current = null;
          redraw();
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={strokes.length === 0}
          onClick={() => onChange(strokes.slice(0, -1))}
        >
          <Undo2Icon /> Desfazer traço
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={strokes.length === 0}
          onClick={() => onChange([])}
        >
          <EraserIcon /> Limpar
        </Button>
      </div>
    </div>
  );
}

/** Desenha os traços num PNG de tamanho fixo (fundo branco), independente da tela. */
export function strokesToPng(strokes: Stroke[], width = 600, height = 200): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1c1c1e';
  for (const stroke of strokes) {
    ctx.beginPath();
    stroke.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x * width, p.y * height) : ctx.lineTo(p.x * width, p.y * height),
    );
    if (stroke.length === 1) ctx.lineTo(stroke[0].x * width + 0.5, stroke[0].y * height);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

/** Assinatura de verdade tem traço: um toque solto não conta. */
export function hasInk(strokes: Stroke[]): boolean {
  let length = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      length += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
  }
  return length > 0.15;
}
