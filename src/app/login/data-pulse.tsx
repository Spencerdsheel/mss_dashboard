"use client";

import { useEffect, useRef } from "react";

const NODES: [number, number][] = [
  [-118, 34], [-99, 19], [-74, 40.7], [-74, 4.6], [-77, -12], [-70, -33], [-46, -23],
  [3, 6], [0, 51], [31, 30], [55, 25], [28, -26], [72, 19], [104, 1], [139, 35], [151, -33], [174, -36],
];

const LAT_TOP = 84;
const LAT_BOTTOM = -58;
const LAT_SPAN = LAT_TOP - LAT_BOTTOM;

interface Pulse {
  e: number;
  t: number;
  sp: number;
  dir: 1 | -1;
}

function spawnPulse(edgeCount: number): Pulse {
  return {
    e: Math.floor(Math.random() * edgeCount),
    t: 0,
    sp: 0.18 + Math.random() * 0.35,
    dir: Math.random() < 0.5 ? 1 : -1,
  };
}

export function DataPulseMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dots: [number, number][] = [];
    let raf = 0;
    let disposed = false;

    const edges: [number, number][] = [];
    for (let i = 0; i < NODES.length - 1; i++) edges.push([i, i + 1]);

    const pulses: Pulse[] = [];
    for (let i = 0; i < 13; i++) pulses.push(spawnPulse(edges.length));

    let fit = { w: 0, h: 0, ox: 0, oy: 0 };
    let dpr = 1;
    let cw = 0;
    let ch = 0;
    let dotR = 1.4;
    let step = 6;
    let buffer: HTMLCanvasElement | null = null;
    let projectedNodes: { x: number; y: number }[] = [];

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const project = (lon: number, lat: number): [number, number] => [
      fit.ox + ((lon + 180) / 360) * fit.w,
      fit.oy + ((LAT_TOP - lat) / LAT_SPAN) * fit.h,
    ];

    const dotColor = () => {
      const style = getComputedStyle(container);
      const fg = style.color;
      return fg || "#6a6a6a";
    };

    const layout = () => {
      cw = container.clientWidth;
      ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;

      const mapAspect = 360 / LAT_SPAN;
      let w: number, h: number;
      if (cw / ch > mapAspect) {
        h = ch;
        w = ch * mapAspect;
      } else {
        w = cw;
        h = cw / mapAspect;
      }
      w *= 0.98;
      h *= 0.98;
      fit = { w, h, ox: (cw - w) / 2, oy: (ch - h) / 2 };

      const cols = Math.round(w / 6.5);
      step = w / cols;
      dotR = Math.max(1.05, step * 0.2);

      buffer = document.createElement("canvas");
      buffer.width = cw * dpr;
      buffer.height = ch * dpr;
      const bctx = buffer.getContext("2d")!;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, cw, ch);

      const color = dotColor();
      bctx.fillStyle = color;
      bctx.globalAlpha = 0.45;

      if (dots.length > 0) {
        for (const [dx, dy] of dots) {
          const px = fit.ox + (dx / 100) * fit.w;
          const py = fit.oy + ((dy - (LAT_TOP - LAT_SPAN) * 100 / 180) / 80) * fit.h;
          const adjPy = fit.oy + ((dy - 3) / 80) * fit.h;
          bctx.beginPath();
          bctx.arc(px, adjPy, dotR, 0, Math.PI * 2);
          bctx.fill();
        }
      }

      bctx.globalAlpha = 1;
      projectedNodes = NODES.map((g) => {
        const [x, y] = project(g[0], g[1]);
        return { x, y };
      });
    };

    let last = performance.now();
    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (buffer) {
        ctx.drawImage(buffer, 0, 0, cw, ch);
      }

      if (!reducedMotion) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(244,98,31,0.22)";
        ctx.beginPath();
        for (const e of edges) {
          const A = projectedNodes[e[0]];
          const B = projectedNodes[e[1]];
          if (A && B) {
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
          }
        }
        ctx.stroke();

        for (let i = 0; i < pulses.length; i++) {
          const p = pulses[i];
          p.t += p.sp * dt;
          if (p.t >= 1) {
            pulses[i] = spawnPulse(edges.length);
            continue;
          }
          const e = edges[p.e];
          const A = projectedNodes[e[0]];
          const B = projectedNodes[e[1]];
          if (!A || !B) continue;
          const tt = p.dir === 1 ? p.t : 1 - p.t;
          const x = A.x + (B.x - A.x) * tt;
          const y = A.y + (B.y - A.y) * tt;
          const back = 0.14 * p.dir * -1;
          const bt = Math.max(0, Math.min(1, tt + back));
          const bx = A.x + (B.x - A.x) * bt;
          const by = A.y + (B.y - A.y) * bt;
          const grad = ctx.createLinearGradient(bx, by, x, y);
          grad.addColorStop(0, "rgba(244,98,31,0)");
          grad.addColorStop(1, "rgba(255,140,70,0.55)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.save();
          ctx.shadowColor = "rgba(255,120,50,0.9)";
          ctx.shadowBlur = 8;
          ctx.fillStyle = "#ffb184";
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        for (let i = 0; i < projectedNodes.length; i++) {
          const n = projectedNodes[i];
          if (!n) continue;
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 13);
          g.addColorStop(0, "rgba(244,98,31,0.35)");
          g.addColorStop(1, "rgba(244,98,31,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 13, 0, Math.PI * 2);
          ctx.fill();

          const phase = (t * 0.55 + i * 0.31) % 1;
          ctx.strokeStyle = `rgba(244,98,31,${((1 - phase) * 0.5).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4 + phase * 13, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = "#F4621F";
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let i = 0; i < projectedNodes.length; i++) {
          const n = projectedNodes[i];
          if (!n) continue;
          ctx.fillStyle = "#F4621F";
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(frame);
    };

    fetch("/world-dots.json")
      .then((r) => r.json())
      .then((d: [number, number][]) => {
        dots = d;
        layout();
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        layout();
        raf = requestAnimationFrame(frame);
      });

    const ro = new ResizeObserver(() => layout());
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 text-muted-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
