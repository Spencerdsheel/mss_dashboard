"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Camera } from "lucide-react";

type PhotoSlot = { label: string; kind: string; url: string | null };

const ALL_SLOTS: { label: string; kind: string }[] = [
  { label: "Storefront", kind: "STOREFRONT" },
  { label: "P1", kind: "PHOTO_1" },
  { label: "P2", kind: "PHOTO_2" },
  { label: "P3", kind: "PHOTO_3" },
  { label: "P4", kind: "PHOTO_4" },
  { label: "P5", kind: "PHOTO_5" },
  { label: "P6", kind: "PHOTO_6" },
  { label: "P7", kind: "PHOTO_7" },
  { label: "P8", kind: "PHOTO_8" },
  { label: "P9", kind: "PHOTO_9" },
];

export function PhotoGallery({ photos }: { photos: PhotoSlot[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const filledPhotos = photos.filter((p): p is PhotoSlot & { url: string } => !!p.url);

  return (
    <>
      <div className="grid grid-cols-5 grid-rows-2 gap-2 h-full">
        {ALL_SLOTS.map((slot) => {
          const photo = photos.find((p) => p.kind === slot.kind);
          const hasUrl = !!photo?.url;
          return (
            <button
              key={slot.kind}
              type="button"
              className={`relative rounded-lg overflow-hidden border transition-all flex flex-col items-center justify-center ${
                hasUrl
                  ? "border-border hover:border-[#ff682c]/50 hover:shadow-md cursor-pointer"
                  : "border-dashed border-border/50 cursor-default"
              }`}
              onClick={() => {
                if (hasUrl) {
                  const idx = filledPhotos.findIndex((p) => p.kind === slot.kind);
                  if (idx >= 0) setLightboxIdx(idx);
                }
              }}
              disabled={!hasUrl}
            >
              {hasUrl ? (
                <>
                  <Image
                    src={photo!.url!}
                    alt={slot.label}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 20vw, 15vw"
                    unoptimized
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                    <span className="text-[10px] font-medium text-white">{slot.label}</span>
                  </div>
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 text-muted-foreground/40" />
                  <span className="text-[9px] text-muted-foreground/40 mt-0.5">{slot.label}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {lightboxIdx !== null && filledPhotos[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="h-5 w-5" />
          </button>

          {filledPhotos.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((lightboxIdx - 1 + filledPhotos.length) % filledPhotos.length);
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((lightboxIdx + 1) % filledPhotos.length);
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div
            className="relative max-h-[80vh] max-w-[80vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={filledPhotos[lightboxIdx].url}
              alt={filledPhotos[lightboxIdx].label}
              width={800}
              height={600}
              className="rounded-lg object-contain max-h-[80vh]"
              unoptimized
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {filledPhotos[lightboxIdx].label} · {lightboxIdx + 1}/{filledPhotos.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
