import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  isRetryableGeminiError,
  passesVerification,
  verifyQuestionImage,
} from "../../../../lib/gemini/verify";
import { redis } from "../../../../lib/redis/client";
import { monadTestnet } from "../../../../lib/viem/chain";
import {
  questionPoolAbi,
  questionPoolContract,
} from "../../../../lib/viem/contracts";

const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const AI_FAILS_AS_ERROR = process.env.AI_FAILS_AS_ERROR !== "false";
const AI_FALLBACK_DIFFICULTY = 2;
const VERIFY_QUESTION_GAS = 500_000n;

const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

async function getQuestionRecord(questionId: number) {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(MONAD_RPC),
  });

  return (await publicClient.readContract({
    address: questionPoolContract.address,
    abi: questionPoolAbi,
    functionName: "questions",
    args: [BigInt(questionId)],
  })) as [bigint, `0x${string}`, string, boolean, number, bigint, bigint];
}

async function approveQuestionOnchain(questionId: number, difficulty: number) {
  const faucetKey = process.env.FAUCET_PRIVATE_KEY;
  if (!faucetKey) throw new Error("Verifier key not configured");

  const account = privateKeyToAccount(faucetKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(MONAD_RPC),
  });
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(MONAD_RPC),
  });

  const hash = await walletClient.writeContract({
    address: questionPoolContract.address,
    abi: questionPoolAbi,
    functionName: "verifyQuestion",
    args: [BigInt(questionId), difficulty],
    gas: VERIFY_QUESTION_GAS,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Question verification transaction failed onchain");
  }
  return hash;
}

type VerifyResponse =
  | {
      status: "approved";
      questionId: number;
      difficulty: string;
      txHash: `0x${string}`;
    }
  | { status: "rejected"; questionId: number; reason: string }
  | { status: "error"; questionId: number; reason: string };

export async function POST(req: Request) {
  try {
    const { questionId, imageUrl, answer } = await req.json();

    if (!questionId || !imageUrl || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\S{2,40}$/.test(answer)) {
      return NextResponse.json(
        { error: "Answer must be a single word (2–40 chars, no spaces)" },
        { status: 400 },
      );
    }

    const question = await getQuestionRecord(questionId);
    if (
      question[0] === 0n ||
      question[1] === "0x0000000000000000000000000000000000000000"
    ) {
      return NextResponse.json(
        { error: "Question does not exist onchain" },
        { status: 400 },
      );
    }

    const key = `contribute:${questionId}`;
    await redis.set(key, JSON.stringify({ status: "verifying", questionId }), {
      ex: 3600,
    });
    await Promise.all([
      redis.set(`question:${questionId}:imageUrl`, imageUrl),
      redis.set(`question:${questionId}:answer`, answer.toUpperCase()),
    ]);

    try {
      const result = await verifyQuestionImage(imageUrl, answer);
      const approved = passesVerification(result);

      if (!approved) {
        const response: VerifyResponse = {
          status: "rejected",
          questionId,
          reason: result.rejectReason ?? "Did not pass AI verification",
        };
        await redis.set(key, JSON.stringify(response), { ex: 3600 });
        return NextResponse.json(response);
      }

      const difficulty = difficultyMap[result.difficulty] ?? 2;
      const hash = await approveQuestionOnchain(questionId, difficulty);
      const response: VerifyResponse = {
        status: "approved",
        questionId,
        difficulty: result.difficulty,
        txHash: hash,
      };
      await redis.set(key, JSON.stringify(response), { ex: 3600 });
      return NextResponse.json(response);
    } catch (e) {
      const aiFallbackError = isRetryableGeminiError(e);

      if (aiFallbackError && !AI_FAILS_AS_ERROR) {
        const hash = await approveQuestionOnchain(
          questionId,
          AI_FALLBACK_DIFFICULTY,
        );
        const response: VerifyResponse = {
          status: "approved",
          questionId,
          difficulty: "medium",
          txHash: hash,
        };
        await redis.set(key, JSON.stringify(response), { ex: 3600 });
        return NextResponse.json(response);
      }

      const response: VerifyResponse = {
        status: "error",
        questionId,
        reason: aiFallbackError
          ? "AI verification is temporarily overloaded. Please retry in a minute."
          : e instanceof Error
            ? e.message
            : "Verification error",
      };
      await redis.set(key, JSON.stringify(response), { ex: 3600 });
      return NextResponse.json(response);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
