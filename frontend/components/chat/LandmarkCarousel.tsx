'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MapPin, CheckCircle2 } from 'lucide-react';
import { getFullImageUrl } from '@/services/wayfinding-client';

interface Landmark {
  id: number;
  name: string;
  description: string;
  real_image_url: string;
  type: 'building' | 'node';
}

interface LandmarkCarouselProps {
  landmarks: Landmark[];
  onConfirm: (landmark: Landmark) => void;
  disabled?: boolean;
}

export function LandmarkCarousel({ landmarks, onConfirm, disabled = false }: LandmarkCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!landmarks || landmarks.length === 0) return null;

  const current = landmarks[currentIndex];

  const next = () => setCurrentIndex((prev) => (prev + 1) % landmarks.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + landmarks.length) % landmarks.length);

  return (
    <div className="flex flex-col gap-3 my-2 max-w-full overflow-hidden">
      <div className="relative group rounded-2xl overflow-hidden bg-slate-900 aspect-video shadow-2xl border border-border/50">
        <img
          src={getFullImageUrl(current.real_image_url)}
          alt={current.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-3.5 h-3.5 text-primary fill-primary/20" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/90">Landmark Found</span>
          </div>
          <h4 className="text-white font-bold text-base leading-tight mb-1">{current.name}</h4>
          <p className="text-white/70 text-xs line-clamp-2 leading-relaxed italic">"{current.description}"</p>
        </div>

        {/* Navigation Arrows */}
        {landmarks.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Counter */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md text-[10px] font-bold text-white/90">
          {currentIndex + 1} / {landmarks.length}
        </div>
      </div>

      <Button
        onClick={() => onConfirm(current)}
        disabled={disabled}
        className="w-full h-10 gap-2 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span className="font-bold text-xs uppercase tracking-wide">Tôi đang ở đây</span>
      </Button>
    </div>
  );
}
