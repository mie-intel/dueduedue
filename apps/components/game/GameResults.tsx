import { CheckCircleIcon, XCircleIcon } from '../icons';
import Button from '../ui/Button';

interface QuestionResult {
  id: number;
  imageUrl: string;
  correct: boolean;
  guess: string;
}

interface GameResultsProps {
  results: QuestionResult[];
  mode: 'free' | 'paid';
  onPlayAgain?: () => void;
  onHome: () => void;
}

export default function GameResults({ results, mode, onPlayAgain, onHome }: GameResultsProps) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const pct = Math.round((correct / total) * 100);

  return (
    <div className="flex flex-col gap-5 px-5 py-6 max-w-lg mx-auto w-full pb-24">
      <div className="bg-bg-card rounded-3xl p-6 text-center shadow-sm">
        <p className="text-5xl font-display font-bold text-primary mb-1">{correct}/{total}</p>
        <p className="text-text-secondary font-sans text-sm">
          {pct >= 80 ? 'Excellent!' : pct >= 50 ? 'Good job!' : 'Keep practicing!'}
        </p>
        {mode === 'paid' && (
          <p className="text-text-secondary text-xs font-sans mt-2">
            Royalties distributed to contributors automatically.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {results.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3 bg-bg-card rounded-2xl p-3 shadow-sm">
            <span className="text-text-secondary text-xs font-mono w-4 shrink-0">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
            <p className="flex-1 font-sans text-sm text-text-primary uppercase">{r.guess || '—'}</p>
            {r.correct
              ? <CheckCircleIcon className="w-5 h-5 text-success shrink-0" />
              : <XCircleIcon className="w-5 h-5 text-error shrink-0" />}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {onPlayAgain && (
          <Button onClick={onPlayAgain} size="lg" className="w-full">
            Play Again
          </Button>
        )}
        <Button variant="outline" onClick={onHome} size="lg" className="w-full">
          Home
        </Button>
      </div>
    </div>
  );
}
