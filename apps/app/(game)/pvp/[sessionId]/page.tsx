"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "../../../../hooks/useWallet";
import { usePlayerLog } from "../../../../hooks/usePlayerLog";
import { useGameSession } from "../../../../hooks/useGameSession";
import Button from "../../../../components/ui/Button";
import Spinner from "../../../../components/ui/Spinner";
import GameEngine, {
  type Question,
  type QuestionResult,
} from "../../../../components/game/GameEngine";
import { CheckCircleIcon, XCircleIcon } from "../../../../components/icons";

export default function PvpSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { isReady, isConnected, address, login } = useWallet();
  const { addEntry } = usePlayerLog(address);
  const session = useGameSession(isConnected ? sessionId : null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<
    "waiting" | "playing" | "submitted" | "done"
  >("waiting");
  const [loadingQ, setLoadingQ] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session.winner || !address) return;

    const logKey = `duelpic_pvp_logged_${sessionId}_${address.toLowerCase()}`;
    if (localStorage.getItem(logKey) === "1") return;

    const isTie = session.winner === "tie";
    const isWinner = session.winner.toLowerCase() === address.toLowerCase();
    const amount = isTie ? -650 : isWinner ? 3700 : -5000;
    addEntry({
      mode: "competitive",
      result: isTie ? "tie" : isWinner ? "win" : "lose",
      amount,
    });
    localStorage.setItem(logKey, "1");
  }, [address, session.winner, sessionId, addEntry]);

  useEffect(() => {
    if (
      session.status >= 1 &&
      session.questionIds.length > 0 &&
      questions.length === 0 &&
      !loadingQ
    ) {
      setLoadingQ(true);
      fetch(`/api/game/questions?ids=${session.questionIds.join(",")}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.questions?.length) {
            setQuestions(data.questions);
            setPhase("playing");
          }
        })
        .catch(() => setError("Failed to load questions"))
        .finally(() => setLoadingQ(false));
    }
  }, [session.status, session.questionIds, questions.length, loadingQ]);

  useEffect(() => {
    if (session.winner && phase !== "done") {
      setPhase("done");
    }
  }, [session.winner, phase]);

  const handleComplete = useCallback(
    async (results: QuestionResult[]) => {
      setPhase("submitted");
      const answers = results.map((r) => r.guess);

      try {
        const res = await fetch(`/api/pvp/answers/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerAddress: address, answers }),
        });
        const data = await res.json();

        if (data.status === "resolved") {
          setPhase("done");
        }
      } catch {
        setError("Failed to submit answers");
      }
    },
    [address, sessionId],
  );

  if (!isReady)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-text-primary font-sans">
          Connect wallet to view this session
        </p>
        <Button onClick={login}>Connect Wallet</Button>
      </div>
    );
  }

  if (session.loading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (session.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-error font-sans text-sm">{session.error}</p>
        <Button onClick={() => router.push("/pvp/lobby")}>Back to Lobby</Button>
      </div>
    );
  }

  if (session.status === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="animate-pulse">
          <svg
            width="88"
            height="88"
            viewBox="0 0 88 88"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="44"
              cy="44"
              r="38"
              fill="currentColor"
              className="text-primary/10"
            />
            <circle
              cx="30"
              cy="37"
              r="10"
              fill="currentColor"
              className="text-primary/30"
            />
            <circle
              cx="58"
              cy="37"
              r="10"
              fill="currentColor"
              className="text-error/30"
            />
            <path
              d="M22 60c4-7 11-11 22-11s18 4 22 11"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              className="text-text-secondary/70"
            />
            <path
              d="M38 42l12 4-12 4 3-4-3-4Z"
              fill="currentColor"
              className="text-text-primary"
            />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="font-display font-bold text-xl text-text-primary mb-2">
            Waiting for Opponent
          </h2>
          <p className="text-text-secondary text-sm font-sans">
            Finding an opponent for you now.
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/pvp/lobby")}>
          Cancel
        </Button>
      </div>
    );
  }

  if (phase === "playing" && questions.length > 0) {
    return (
      <GameEngine
        questions={questions}
        secondsPerQuestion={8}
        mode="free"
        onComplete={handleComplete}
        onHome={() => router.push("/")}
      />
    );
  }

  if (phase === "submitted") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <Spinner size="lg" />
        <p className="font-display font-bold text-xl text-text-primary">
          Waiting for opponent…
        </p>
        <p className="text-text-secondary text-sm font-sans">
          Your answers submitted. Hang tight.
        </p>
      </div>
    );
  }

  if (phase === "done" && session.winner) {
    const isWinner = session.winner.toLowerCase() === address?.toLowerCase();
    const isTie = session.winner === "tie";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        {isTie ? (
          <>
            <p className="font-display font-bold text-3xl text-text-primary">
              Tie!
            </p>
            <p className="text-text-secondary text-sm font-sans">
              -Rp 650 net after fees
            </p>
          </>
        ) : isWinner ? (
          <>
            <CheckCircleIcon className="w-20 h-20 text-success" />
            <p className="font-display font-bold text-3xl text-success">
              You Win!
            </p>
            <p className="text-text-secondary text-sm font-sans">
              Rp 8.700 added to withdrawable
            </p>
          </>
        ) : (
          <>
            <XCircleIcon className="w-20 h-20 text-error" />
            <p className="font-display font-bold text-3xl text-error">
              You Lose
            </p>
            <p className="text-text-secondary text-sm font-sans">
              -Rp 5.000 net loss
            </p>
          </>
        )}
        <Button
          onClick={() => router.push("/pvp/lobby")}
          size="lg"
          className="w-full max-w-xs"
        >
          Play Again
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")} size="sm">
          Home
        </Button>
        {isWinner && (
          <Button
            variant="ghost"
            onClick={() => router.push("/activity")}
            size="sm"
          >
            Activity
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
