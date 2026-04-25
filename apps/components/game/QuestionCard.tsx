'use client';

import { useRef, useEffect } from 'react';

interface QuestionCardProps {
  imageUrl: string;
  questionNum: number;
  totalQuestions: number;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export default function QuestionCard({
  imageUrl, questionNum, totalQuestions, value, onChange, onSubmit, disabled,
}: QuestionCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [questionNum]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
      <div className="flex items-center justify-between text-xs text-text-secondary font-sans">
        <span>{questionNum} / {totalQuestions}</span>
      </div>

      <div className="rounded-3xl overflow-hidden bg-bg-card aspect-square max-h-72 w-full flex items-center justify-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Guess this"
          className="w-full h-full object-cover"
          loading="eager"
        />
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && onSubmit()}
          placeholder="Type your answer..."
          maxLength={40}
          disabled={disabled}
          autoCapitalize="characters"
          className="flex-1 rounded-2xl bg-bg-card border border-text-secondary/20 px-4 py-3 font-sans text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-primary/50 uppercase disabled:opacity-50"
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim() || disabled}
          className="px-5 py-3 rounded-2xl bg-primary text-text-inverse font-semibold text-sm font-sans disabled:opacity-40 active:opacity-80"
        >
          Go
        </button>
      </div>
    </div>
  );
}
