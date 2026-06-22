"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Photo = { label: string; kind: string; url: string };

export function PhotoGallery({
  storefront,
  gallery,
}: {
  storefront?: Photo;
  gallery: Photo[];
}) {
  const [active, setActive] = useState<Photo | null>(null);

  return (
    <div className="space-y-4">
      {storefront && (
        <button
          type="button"
          onClick={() => setActive(storefront)}
          className="group block w-full overflow-hidden rounded-lg border bg-muted"
        >
          <div className="relative h-72 w-full">
            <Image
              src={storefront.url}
              alt={storefront.label}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
            />
            <div className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
              Vitrine
            </div>
          </div>
        </button>
      )}

      {gallery.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gallery.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => setActive(p)}
              className="group relative h-32 overflow-hidden rounded-lg border bg-muted"
            >
              <Image
                src={p.url}
                alt={p.label}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                unoptimized
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] font-medium text-white">
                {p.label}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{active?.label}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="relative max-h-[75vh] w-full">
              <Image
                src={active.url}
                alt={active.label}
                width={1200}
                height={800}
                className="w-full rounded-md object-contain"
                unoptimized
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
