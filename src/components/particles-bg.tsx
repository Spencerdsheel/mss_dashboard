"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const BASE_COUNT = 28;
const DENSITY_AREA = 1400;
const MIN_COUNT = 15;
const MAX_COUNT = 50;
const SPEED = 1.0;
const LINE_DISTANCE = 140;
const LINE_OPACITY = 0.12;
const GRAB_DISTANCE = 160;
const GRAB_OPACITY = 0.35;
const PARTICLE_OPACITY = 0.3;

function randomRadius() {
  return 1 + Math.random() * 1.5;
}

function randomVelocity() {
  const angle = Math.random() * Math.PI * 2;
  return {
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
  };
}

function makeParticle(cw: number, ch: number): Particle {
  const { vx, vy } = randomVelocity();
  return {
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx,
    vy,
    radius: randomRadius(),
  };
}

export function ParticlesBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    let particles: Particle[] = [];
    let dpr = 1;
    let cw = 0;
    let ch = 0;
    let color = "#6a6a6a";
    let mouseX: number | null = null;
    let mouseY: number | null = null;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const particleColor = () => {
      const style = getComputedStyle(container);
      return style.color || "#6a6a6a";
    };

    const targetCount = (w: number, h: number) => {
      const count = Math.round(((w * h) / (DENSITY_AREA * 100)) * BASE_COUNT);
      return Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
    };

    const resize = () => {
      cw = container.clientWidth;
      ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      color = particleColor();

      const desired = targetCount(cw, ch);
      if (particles.length === 0) {
        particles = Array.from({ length: desired }, () => makeParticle(cw, ch));
      } else if (particles.length > desired) {
        particles = particles.slice(0, desired);
      } else if (particles.length < desired) {
        const extra = desired - particles.length;
        for (let i = 0; i < extra; i++) particles.push(makeParticle(cw, ch));
      }
    };

    const drawStatic = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalAlpha = PARTICLE_OPACITY;
      ctx.fillStyle = color;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const frame = () => {
      if (disposed) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = cw;
        else if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch;
        else if (p.y > ch) p.y = 0;
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINE_DISTANCE) {
            const opacity = LINE_OPACITY * (1 - dist / LINE_DISTANCE);
            ctx.strokeStyle = color;
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      if (mouseX !== null && mouseY !== null) {
        ctx.strokeStyle = color;
        for (const p of particles) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < GRAB_DISTANCE) {
            const opacity = GRAB_OPACITY * (1 - dist / GRAB_DISTANCE);
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = PARTICLE_OPACITY;
      ctx.fillStyle = color;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = null;
      mouseY = null;
    };

    const handleClick = (e: MouseEvent) => {
      if (reducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (let i = 0; i < 3; i++) {
        const { vx, vy } = randomVelocity();
        particles.push({ x, y, vx, vy, radius: randomRadius() });
      }
      if (particles.length > MAX_COUNT * 2) {
        particles = particles.slice(particles.length - MAX_COUNT * 2);
      }
    };

    resize();

    if (reducedMotion) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
      container.addEventListener("click", handleClick);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion) drawStatic();
    });
    ro.observe(container);

    const mo = new MutationObserver(() => {
      color = particleColor();
      if (reducedMotion) drawStatic();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 text-foreground pointer-events-auto"
      style={{ zIndex: 0 }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
