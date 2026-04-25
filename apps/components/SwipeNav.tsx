'use client';

import { useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const tabs = ['/', '/contribute', '/activity', '/profile'];

export default function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isHorizontal = useRef(false);
  const [offset, setOffset] = useState(0);
  const [snapping, setSnapping] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = false;
    setSnapping(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = Math.abs(e.touches[0].clientY - startY.current);

    if (!isHorizontal.current) {
      if (Math.abs(dx) < 8 && dy < 8) return;
      if (dy > Math.abs(dx)) return;
      isHorizontal.current = true;
    }

    const idx = tabs.indexOf(pathname);
    const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === tabs.length - 1);
    setOffset(dx * (atEdge ? 0.15 : 0.35));
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null || !isHorizontal.current) {
      startX.current = null;
      startY.current = null;
      setOffset(0);
      return;
    }
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    startY.current = null;
    isHorizontal.current = false;

    const idx = tabs.indexOf(pathname);
    setSnapping(true);

    if (Math.abs(dx) >= 50 && idx !== -1) {
      if (dx < 0 && idx < tabs.length - 1) {
        setOffset(-80);
        setTimeout(() => {
          router.push(tabs[idx + 1]);
          setOffset(0);
        }, 120);
        return;
      }
      if (dx > 0 && idx > 0) {
        setOffset(80);
        setTimeout(() => {
          router.push(tabs[idx - 1]);
          setOffset(0);
        }, 120);
        return;
      }
    }
    setOffset(0);
  };

  return (
    <main
      className="flex-1 flex flex-col max-w-md mx-auto w-full overflow-x-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: snapping ? 'transform 0.18s ease-out' : 'none',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </main>
  );
}
