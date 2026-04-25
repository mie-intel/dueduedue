"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createPublicClient, http, parseEventLogs } from "viem";
import { monadTestnet } from "../../../../lib/viem/chain";
import {
  questionPoolAbi,
  questionPoolContract,
  mockIdrxAbi,
  mockIdrxContract,
} from "../../../../lib/viem/contracts";
import { useWallet } from "../../../../hooks/useWallet";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Spinner from "../../../../components/ui/Spinner";
import {
  CameraIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertIcon,
} from "../../../../components/icons";

// Rp 200 = 20_000 raw IDRX (2 decimals) — covers AI verification + platform cost
const SUBMIT_FEE = 20_000n;
const SUBMIT_QUESTION_GAS = 500_000n;
const PLATFORM_ADDRESS = (
  process.env.NEXT_PUBLIC_PLATFORM_ADDRESS ?? process.env.NEXT_PUBLIC_QUESTION_POOL_ADDRESS
) as `0x${string}`;

type Step =
  | "form"
  | "paying"
  | "uploading"
  | "submitting"
  | "verifying"
  | "done"
  | "error";

interface VerifyStatus {
  status: "verifying" | "approved" | "rejected" | "error";
  questionId?: number;
  difficulty?: string;
  txHash?: string;
  reason?: string;
}

export default function ContributeSubmitPage() {
  const router = useRouter();
  const { isConnected, isReady, walletClient, address, login } = useWallet();
  const [step, setStep] = useState<Step>("form");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image must be under 5MB.");
      return;
    }
    setErrorMsg("");
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect],
  );

  const pollStatus = useCallback((questionId: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/contribute/${questionId}/status`);
        const data: VerifyStatus = await res.json();
        if (data.status !== "verifying") {
          clearInterval(pollRef.current!);
          setVerifyStatus(data);
          setStep("done");
        }
      } catch {
        // keep polling on network error
      }
    }, 3000);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!imageFile || !answer.trim() || !walletClient || !address) return;

    try {
      // Step 1: Pay submission fee in IDRX
      setStep("paying");
      const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(),
      });
      const questionCountBefore = (await publicClient.readContract({
        ...questionPoolContract,
        functionName: "questionCount",
      })) as bigint;

      const feeHash = await walletClient.writeContract({
        address: mockIdrxContract.address,
        abi: mockIdrxAbi,
        functionName: "transfer",
        args: [PLATFORM_ADDRESS, SUBMIT_FEE],
        account: address,
        chain: monadTestnet,
      });
      const feeReceipt = await publicClient.waitForTransactionReceipt({
        hash: feeHash,
      });
      if (feeReceipt.status !== "success") {
        throw new Error("Submission fee transfer failed onchain");
      }

      // Step 2: Upload image to Pinata
      setStep("uploading");
      const form = new FormData();
      form.append("image", imageFile);
      const uploadRes = await fetch("/api/contribute/upload", {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const { cid, imageUrl } = await uploadRes.json();

      // Step 3: Call submitQuestion on-chain
      setStep("submitting");
      const simulatedSubmit = await publicClient.simulateContract({
        address: questionPoolContract.address,
        abi: questionPoolAbi,
        functionName: "submitQuestion",
        args: [cid],
        account: address,
      });
      const expectedQuestionId = Number(simulatedSubmit.result ?? 0n);

      const hash = await walletClient.writeContract({
        address: questionPoolContract.address,
        abi: questionPoolAbi,
        functionName: "submitQuestion",
        args: [cid],
        account: address,
        chain: monadTestnet,
        gas: SUBMIT_QUESTION_GAS,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Question submission transaction failed onchain");
      }

      // Prefer the emitted event, but fall back to reading the new question from state
      // since some chains/providers can return logs that viem does not decode consistently.
      let questionId = 0;
      try {
        const logs = parseEventLogs({
          abi: questionPoolAbi,
          eventName: "QuestionSubmitted",
          logs: receipt.logs.filter(
            (log) =>
              log.address.toLowerCase() ===
              questionPoolContract.address.toLowerCase(),
          ),
          strict: false,
        });
        questionId = Number(logs[0]?.args?.id ?? 0);
      } catch {
        // Fall through to the on-chain state lookup below.
      }

      if (!questionId) {
        const questionCountAfter = (await publicClient.readContract({
          ...questionPoolContract,
          functionName: "questionCount",
        })) as bigint;

        for (
          let id = questionCountAfter;
          id > questionCountBefore && !questionId;
          id -= 1n
        ) {
          const question = (await publicClient.readContract({
            ...questionPoolContract,
            functionName: "questions",
            args: [id],
          })) as [
            bigint,
            `0x${string}`,
            string,
            boolean,
            number,
            bigint,
            bigint,
          ];

          if (
            question[1].toLowerCase() === address.toLowerCase() &&
            question[2] === cid
          ) {
            questionId = Number(id);
          }
        }
      }

      if (
        !questionId &&
        expectedQuestionId > 0 &&
        BigInt(expectedQuestionId) > questionCountBefore
      ) {
        questionId = expectedQuestionId;
      }

      if (!questionId)
        throw new Error("Could not get question ID from transaction");

      // Step 3: Start AI verification
      setStep("verifying");
      setVerifyStatus({ status: "verifying", questionId });

      const verifyRes = await fetch("/api/contribute/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          imageUrl,
          answer: answer.trim().toUpperCase(),
        }),
      });
      const verifyData: VerifyStatus = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.reason ?? "Verification failed");
      }

      if (verifyData.status === "verifying") {
        pollStatus(questionId);
      } else {
        setVerifyStatus(verifyData);
        setStep("done");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [imageFile, answer, walletClient, address, pollStatus]);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-purple-400/20 border-2 border-primary/30 flex items-center justify-center shadow-lg">
          <CameraIcon className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-text-primary mb-2">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm">
            Connect wallet to submit questions and earn royalties
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  // Done state
  if (step === "done" && verifyStatus) {
    const approved = verifyStatus.status === "approved";
    return (
      <div className="flex-1 overflow-y-auto bg-bg-page pb-24">
        <div className="bg-bg-card px-5 pt-8 pb-6 shadow-sm">
          <div className="max-w-lg mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-light flex items-center justify-center shrink-0">
              <CameraIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-text-primary">
                {approved ? "Question Approved!" : "Submission Reviewed"}
              </h1>
              <p className="text-text-secondary text-sm font-sans mt-0.5">
                {approved
                  ? "Your image is now live in the question pool"
                  : "AI verification complete"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 max-w-lg mx-auto flex flex-col gap-4">
          {approved ? (
            <Card className="border border-success/30 bg-success/5">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="w-8 h-8 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-sans font-semibold text-text-primary">
                    Question #{verifyStatus.questionId} is live!
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    Difficulty:{" "}
                    <span className="capitalize font-medium text-primary">
                      {verifyStatus.difficulty}
                    </span>
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    You&apos;ll earn royalties every time it&apos;s played in a
                    paid session.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border border-error/30 bg-error/5">
              <div className="flex items-start gap-3">
                <XCircleIcon className="w-8 h-8 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="font-sans font-semibold text-text-primary">
                    Not approved
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    {verifyStatus.reason ??
                      "Image did not pass AI verification."}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {!approved && (
              <Button
                onClick={() => {
                  setStep("form");
                  setImageFile(null);
                  setImagePreview(null);
                  setAnswer("");
                  setVerifyStatus(null);
                }}
              >
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push("/contribute")}
            >
              Back to Contribute
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Verifying / loading states
  if (
    step === "paying" ||
    step === "uploading" ||
    step === "submitting" ||
    step === "verifying"
  ) {
    const stepLabels: Record<Step, string> = {
      paying: "Paying submission fee…",
      uploading: "Uploading image…",
      submitting: "Submitting to blockchain…",
      verifying: "AI is verifying your image…",
      form: "",
      done: "",
      error: "",
    };
    const stepDesc: Record<Step, string> = {
      paying: "Rp 200 · platform fee",
      uploading: "Storing your image securely",
      submitting: "Sign the transaction in your wallet",
      verifying: "AI checks content, relevance, difficulty. Takes ~30 sec.",
      form: "",
      done: "",
      error: "",
    };
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="w-20 h-20 rounded-3xl bg-primary-light flex items-center justify-center">
          <Spinner size="lg" />
        </div>
        <div className="text-center">
          <p className="font-display font-bold text-xl text-text-primary">
            {stepLabels[step]}
          </p>
          <p className="text-text-secondary text-sm font-sans mt-2">
            {stepDesc[step]}
          </p>
        </div>
        {step === "verifying" && verifyStatus?.questionId && (
          <p className="text-xs text-text-secondary font-mono">
            Question ID: #{verifyStatus.questionId}
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <div className="w-20 h-20 rounded-3xl bg-error/10 flex items-center justify-center">
          <AlertIcon className="w-10 h-10 text-error" />
        </div>
        <div className="text-center">
          <p className="font-display font-bold text-xl text-text-primary">
            Submission Failed
          </p>
          <p className="text-text-secondary text-sm font-sans mt-2 max-w-xs">
            {errorMsg}
          </p>
        </div>
        <Button onClick={() => setStep("form")}>Try Again</Button>
      </div>
    );
  }

  // Form
  const answerValid = /^\S{2,40}$/.test(answer);
  const canSubmit = !!imageFile && answerValid;

  return (
    <div className="flex-1 overflow-y-auto bg-bg-page pb-24">
      {/* Header */}
      <div className="bg-bg-card px-5 pt-8 pb-6 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/contribute")}
            className="w-9 h-9 rounded-xl bg-bg-page flex items-center justify-center text-text-secondary hover:text-text-primary shrink-0"
          >
            ‹
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl text-text-primary">
              Submit Image
            </h1>
            <p className="text-text-secondary text-sm font-sans mt-0.5">
              Upload · AI verified · Earn royalties
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto w-full flex flex-col gap-5">
        {/* Image upload */}
        <div>
          <label className="font-sans font-semibold text-sm text-text-primary mb-2 block">
            Image <span className="text-error">*</span>
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={[
              "relative rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
              "flex flex-col items-center justify-center overflow-hidden",
              imagePreview
                ? "border-primary/40 h-56"
                : "border-text-secondary/30 hover:border-primary/50 h-44",
            ].join(" ")}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-secondary p-6">
                <CameraIcon className="w-10 h-10 text-text-secondary/60" />
                <p className="font-sans text-sm text-center">
                  Tap to select or drag an image here
                </p>
                <p className="text-xs">JPG, PNG, WEBP · Max 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </div>
          {imagePreview && (
            <button
              onClick={() => {
                setImageFile(null);
                setImagePreview(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="mt-2 text-xs text-error hover:underline"
            >
              Remove image
            </button>
          )}
        </div>

        {/* Answer input */}
        <div>
          <label className="font-sans font-semibold text-sm text-text-primary mb-2 block">
            Answer <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/\s+/g, ""))}
            placeholder="e.g. Banana"
            maxLength={40}
            className={[
              "w-full rounded-2xl bg-bg-card border px-4 py-3",
              "font-sans text-sm text-text-primary placeholder:text-text-secondary/60",
              "focus:outline-none transition-colors",
              answer && !/^\S+$/.test(answer)
                ? "border-error/60 focus:border-error"
                : "border-text-secondary/20 focus:border-primary/50",
            ].join(" ")}
          />
          <p className="text-xs text-text-secondary mt-1.5">
            One clear universal word — something everyone worldwide can
            recognize
          </p>
        </div>

        {errorMsg && <p className="text-sm text-error font-sans">{errorMsg}</p>}

        {/* Fee + info */}
        <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-sans font-semibold text-sm text-text-primary">
              Submission fee
            </span>
            <span className="font-sans font-bold text-sm text-secondary-dark">
              Rp 200
            </span>
          </div>
          <p className="font-sans text-xs text-text-secondary">
            Platform fee covers verification and storage. Image goes on-chain; you earn
            royalties on every paid game that uses it.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          className="w-full"
        >
          Submit · Pay Rp 200
        </Button>
      </div>
    </div>
  );
}
