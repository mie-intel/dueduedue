"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  encodeFunctionData,
  maxUint256,
  parseEventLogs,
  parseUnits,
} from "viem";
import { SwordsIcon } from "../../../../components/icons";
import Button from "../../../../components/ui/Button";
import Spinner from "../../../../components/ui/Spinner";
import { useWallet } from "../../../../hooks/useWallet";
import { parseContractError } from "../../../../lib/parseContractError";
import { monadTestnet } from "../../../../lib/viem/chain";
import { publicClient } from "../../../../lib/viem/client";
import {
  gameSessionAbi,
  gameSessionContract,
  mockIdrxAbi,
} from "../../../../lib/viem/contracts";

const WAGER = parseUnits("5000", 2);
const APPROVE_GAS_LIMIT = 100_000n;
const JOIN_SESSION_GAS_LIMIT = 250_000n;
const CREATE_SESSION_GAS_LIMIT = 500_000n;

function isMalformedRpcResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /Unexpected non-whitespace character after JSON|Unexpected token.*JSON|JSON\.parse/i.test(
    msg,
  );
}

function withGasBuffer(gas: bigint) {
  return (gas * 12n) / 10n;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function FindingOpponentArt() {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 88 88"
      fill="none"
      aria-hidden="true"
      className="animate-pulse"
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
  );
}

export default function PvpLobbyPage() {
  const router = useRouter();
  const { sendTransaction } = useSendTransaction();
  const {
    isReady,
    isConnected,
    address,
    walletClient,
    walletClientType,
    connectorType,
    login,
  } = useWallet();
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [matchError, setMatchError] = useState("");
  const cancelledRef = useRef(false);
  const isEmbeddedPrivyWallet =
    walletClientType === "privy" || connectorType === "embedded";

  const getPaymentToken = useCallback(async () => {
    return (await publicClient.readContract({
      ...gameSessionContract,
      functionName: "paymentToken",
    })) as `0x${string}`;
  }, []);

  const getGasLimit = useCallback(
    async (to: `0x${string}`, data: `0x${string}`, fallback: bigint) => {
      if (!address) return fallback;

      try {
        const estimatedGas = await publicClient.estimateGas({
          account: address,
          to,
          data,
        });
        return withGasBuffer(estimatedGas);
      } catch (e) {
        if (isMalformedRpcResponse(e)) return fallback;
        throw e;
      }
    },
    [address],
  );

  const sendEncodedTransaction = useCallback(
    async (params: {
      to: `0x${string}`;
      data: `0x${string}`;
      fallbackGasLimit: bigint;
      description: string;
      buttonText: string;
      successHeader: string;
    }) => {
      if (!address) throw new Error("Wallet not connected.");

      if (isEmbeddedPrivyWallet) {
        const gasLimit = await getGasLimit(
          params.to,
          params.data,
          params.fallbackGasLimit,
        );
        const result = await sendTransaction(
          {
            from: address,
            to: params.to,
            data: params.data,
            chainId: monadTestnet.id,
            gasLimit,
          },
          {
            address,
            uiOptions: {
              showWalletUIs: true,
              description: params.description,
              buttonText: params.buttonText,
              successHeader: params.successHeader,
            },
          },
        );
        return result.hash as `0x${string}`;
      }

      if (!walletClient) throw new Error("Wallet signer is not ready yet.");
      return await walletClient.sendTransaction({
        account: address,
        chain: monadTestnet,
        to: params.to,
        data: params.data,
      });
    },
    [
      address,
      getGasLimit,
      isEmbeddedPrivyWallet,
      sendTransaction,
      walletClient,
    ],
  );

  const waitForSuccessfulReceipt = useCallback(
    async (hash: `0x${string}`, action: string) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error(
          `${action} reverted on-chain. Check IDRX balance, IDRX approval, and MON gas, then try again.`,
        );
      }
      return receipt;
    },
    [],
  );

  const readAllowance = useCallback(
    async (tokenAddress: `0x${string}`) => {
      if (!address) return 0n;
      return (await publicClient.readContract({
        address: tokenAddress,
        abi: mockIdrxAbi,
        functionName: "allowance",
        args: [address, gameSessionContract.address],
      })) as bigint;
    },
    [address],
  );

  const ensureBalance = useCallback(
    async (tokenAddress: `0x${string}`) => {
      if (!address) return;
      const balance = (await publicClient.readContract({
        address: tokenAddress,
        abi: mockIdrxAbi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      if (balance < WAGER) {
        throw new Error(
          `Not enough IDRX. Need Rp 5.000 but wallet has Rp ${(Number(balance) / 100).toLocaleString("id-ID")}.`,
        );
      }
    },
    [address],
  );

  const ensureAllowance = useCallback(
    async (tokenAddress: `0x${string}`) => {
      if (!address) return;
      const allowance = await readAllowance(tokenAddress);
      if (allowance < WAGER) {
        const data = encodeFunctionData({
          abi: mockIdrxAbi,
          functionName: "approve",
          args: [gameSessionContract.address, maxUint256],
        });
        const hash = await sendEncodedTransaction({
          to: tokenAddress,
          data,
          fallbackGasLimit: APPROVE_GAS_LIMIT,
          description: "Approve IDRX for PvP wager",
          buttonText: "Approve",
          successHeader: "Approval complete",
        });
        await waitForSuccessfulReceipt(hash, "IDRX approval");

        for (let attempt = 0; attempt < 6; attempt++) {
          if ((await readAllowance(tokenAddress)) >= WAGER) return;
          await sleep(750);
        }

        throw new Error(
          "IDRX approval was confirmed, but the allowance is not visible yet. Try again in a moment.",
        );
      }
    },
    [address, readAllowance, sendEncodedTransaction, waitForSuccessfulReceipt],
  );

  const ensureReadyToPay = useCallback(
    async (tokenAddress: `0x${string}`) => {
      await ensureBalance(tokenAddress);
      await ensureAllowance(tokenAddress);
    },
    [ensureAllowance, ensureBalance],
  );

  const sendJoinSession = useCallback(
    async (sessionId: `0x${string}`) => {
      const data = encodeFunctionData({
        abi: gameSessionAbi,
        functionName: "joinSession",
        args: [sessionId],
      });
      return await sendEncodedTransaction({
        to: gameSessionContract.address,
        data,
        fallbackGasLimit: JOIN_SESSION_GAS_LIMIT,
        description: "Join PvP match",
        buttonText: "Join",
        successHeader: "Joined match",
      });
    },
    [sendEncodedTransaction],
  );

  const sendCreateSession = useCallback(
    async (questionIds: bigint[]) => {
      const data = encodeFunctionData({
        abi: gameSessionAbi,
        functionName: "createSession",
        args: [WAGER, questionIds, address],
      });
      return await sendEncodedTransaction({
        to: gameSessionContract.address,
        data,
        fallbackGasLimit: CREATE_SESSION_GAS_LIMIT,
        description: "Create PvP match",
        buttonText: "Create Match",
        successHeader: "Match created",
      });
    },
    [sendEncodedTransaction],
  );

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setMatching(false);
    setMatchError("");
    setError("");
    router.push("/");
  }, [router]);

  const handlePlay = useCallback(async () => {
    if (!address) return;
    cancelledRef.current = false;
    setMatching(true);
    setError("");
    setMatchError("");

    try {
      const matchRes = await fetch("/api/pvp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", playerAddress: address }),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) throw new Error(matchData.error);

      if (matchData.action === "resume") {
        router.push(`/pvp/${matchData.sessionId}`);
        return;
      }

      if (matchData.action === "join") {
        const sessionId = matchData.sessionId as `0x${string}`;
        const tokenAddress = await getPaymentToken();
        await ensureReadyToPay(tokenAddress);
        const hash = await sendJoinSession(sessionId);
        await waitForSuccessfulReceipt(hash, "Joining PvP session");

        await fetch("/api/pvp/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", sessionId }),
        });

        router.push(`/pvp/${sessionId}`);
        return;
      }

      const questionIds = (matchData.questionIds ?? []).map(
        (id: number | string) => BigInt(id),
      );
      if (questionIds.length === 0) {
        throw new Error("No questions available for PvP.");
      }

      const tokenAddress = await getPaymentToken();
      await ensureReadyToPay(tokenAddress);

      const hash = await sendCreateSession(questionIds);
      const receipt = await waitForSuccessfulReceipt(hash, "Session creation");
      let sessionId: `0x${string}` | null = null;
      try {
        const createdLogs = parseEventLogs({
          abi: gameSessionAbi,
          eventName: "SessionCreated",
          logs: receipt.logs,
          strict: false,
        });
        const args = createdLogs[0]?.args as
          | { id?: `0x${string}`; sessionId?: `0x${string}` }
          | undefined;
        sessionId = args?.sessionId ?? args?.id ?? null;
      } catch {
        // handled by the explicit null check below
      }

      if (!sessionId) {
        throw new Error(
          "Session was created, but the session ID was missing from the receipt. Try the lobby again.",
        );
      }

      await fetch("/api/pvp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          playerAddress: address,
          sessionId,
          questionIds: questionIds.map(Number),
        }),
      });

      router.push(`/pvp/${sessionId}`);
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = parseContractError(e);
      const isFatal =
        /rejected|Not enough|Wrong network|approval|reverted|malformed|Wallet signer|allowance/i.test(
          msg,
        );
      if (isFatal) {
        setError(msg);
        setMatching(false);
      } else {
        setMatchError(msg);
      }
    }
  }, [
    address,
    getPaymentToken,
    ensureReadyToPay,
    router,
    sendCreateSession,
    sendJoinSession,
    waitForSuccessfulReceipt,
  ]);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
        <SwordsIcon className="w-16 h-16 text-error" />
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
            PvP Ranked
          </h1>
          <p className="text-text-secondary font-sans text-sm">
            Connect wallet to battle 1v1
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-24">
      {matching ? (
        <FindingOpponentArt />
      ) : (
        <SwordsIcon className="w-16 h-16 text-error" />
      )}

      <div className="text-center">
        <h1 className="font-display font-bold text-3xl text-text-primary mb-2">
          PvP Ranked
        </h1>
        <p className="text-text-secondary font-sans text-sm">
          Rp 5.000 wager · 10 questions · 8 sec each
        </p>
        <p className="text-text-secondary text-xs font-sans mt-1">
          Play now and we&apos;ll find your opponent automatically.
        </p>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-error text-sm font-sans text-center max-w-xs">
          {error}
        </div>
      )}

      {matching ? (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <p className="text-text-primary font-semibold font-sans text-center">
            {matchError ? "Having trouble..." : "Finding opponent..."}
          </p>
          {matchError ? (
            <p className="text-error text-xs font-sans text-center">
              {matchError}
            </p>
          ) : (
            <p className="text-text-secondary text-sm font-sans text-center">
              If someone is already waiting, you&apos;ll join them instantly.
              Otherwise, we&apos;ll keep your room open.
            </p>
          )}
          <div className="flex items-center gap-2 text-text-secondary text-xs font-sans">
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
          </div>
          <Button variant="ghost" onClick={handleCancel} size="sm">
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            onClick={handlePlay}
            size="lg"
            className="w-full"
            loading={matching}
          >
            Play
          </Button>
          <Button variant="ghost" onClick={() => router.push("/")} size="sm">
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
