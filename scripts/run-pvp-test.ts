import dotenv from "dotenv";
import path from "path";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from "viem";
import { monadTestnet } from "../lib/viem/chain";
import fs from "fs";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC ?? "https://testnet-rpc.monad.xyz";
const GAME = process.env.NEXT_PUBLIC_GAME_SESSION_ADDRESS as `0x${string}`;
const CASUAL = process.env.NEXT_PUBLIC_CASUAL_POOL_ADDRESS as `0x${string}`;
const IDRX = process.env.NEXT_PUBLIC_MOCK_IDRX_ADDRESS as `0x${string}`;
const QUESTION_POOL = process.env
  .NEXT_PUBLIC_QUESTION_POOL_ADDRESS as `0x${string}`;

const gameAbi = [
  {
    type: "function",
    name: "createSession",
    inputs: [
      { name: "wager", type: "uint256" },
      { name: "questionIdList", type: "uint256[]" },
      { name: "payer", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "joinSession",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "commitAnswers",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "commitHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealAnswers",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "answers", type: "string[]" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "SessionCreated",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "player1", type: "address", indexed: true },
      { name: "wager", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "SessionResolved",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "winner", type: "address", indexed: false },
      { name: "payout", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "pendingPvpPayout",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const idrxAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

async function main() {
  if (!GAME || !CASUAL || !IDRX || !QUESTION_POOL) {
    console.error("Missing env addresses in apps/.env.local");
    process.exit(1);
  }

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(RPC),
  });

  const faucetPk = process.env.FAUCET_PRIVATE_KEY as `0x${string}`;
  if (!faucetPk) {
    console.error("FAUCET_PRIVATE_KEY missing");
    process.exit(1);
  }
  const faucet = privateKeyToAccount(faucetPk);
  const faucetClient = createWalletClient({
    account: faucet,
    chain: monadTestnet,
    transport: http(RPC),
  });

  // create two test accounts
  const pk1 =
    process.env.TEST_PK1 ||
    "0x1111111111111111111111111111111111111111111111111111111111111111";
  const pk2 =
    process.env.TEST_PK2 ||
    "0x2222222222222222222222222222222222222222222222222222222222222222";
  const a1 = privateKeyToAccount(pk1 as `0x${string}`);
  const a2 = privateKeyToAccount(pk2 as `0x${string}`);
  const c1 = createWalletClient({
    account: a1,
    chain: monadTestnet,
    transport: http(RPC),
  });
  const c2 = createWalletClient({
    account: a2,
    chain: monadTestnet,
    transport: http(RPC),
  });

  console.log("Fund player accounts with native for gas...");
  // send small native amount from faucet to players
  const tx1 = await faucetClient.sendTransaction({
    to: a1.address,
    value: 1_000_000_000_000_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx1 });
  const tx2 = await faucetClient.sendTransaction({
    to: a2.address,
    value: 1_000_000_000_000_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx2 });

  // mint IDRX to both players
  const idrxContract = { address: IDRX, abi: idrxAbi } as const;
  const mintAmount = 200_000n; // raw = Rp 2000
  console.log("Minting IDRX to players...");
  await faucetClient.writeContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "mint",
    args: [a1.address, mintAmount],
  });
  await publicClient.waitForTransactionReceipt({
    hash: await faucetClient.writeContract({
      address: IDRX,
      abi: idrxAbi,
      functionName: "mint",
      args: [a2.address, mintAmount],
    }),
  });

  // show balances
  const b1 = await publicClient.readContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [a1.address],
  });
  const b2 = await publicClient.readContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [a2.address],
  });
  console.log("Balance P1:", b1.toString(), "P2:", b2.toString());

  // player1 approve game to spend wager
  const wager = 50_000n; // Rp 500
  console.log("Approving GameSession from P1/P2...");
  await c1.writeContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "approve",
    args: [GAME, wager],
  });
  await publicClient.waitForTransactionReceipt({
    hash: await c2.writeContract({
      address: IDRX,
      abi: idrxAbi,
      functionName: "approve",
      args: [GAME, wager],
    }),
  });

  const gameContract = { address: GAME, abi: gameAbi } as const;

  // create session
  console.log("Creating session from P1...");
  const questionIds = [1];
  const createHash = await c1.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "createSession",
    args: [wager, questionIds, a1.address],
    gas: 500_000n,
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({
    hash: createHash,
  });
  const createdLogs = parseEventLogs({
    abi: gameAbi,
    eventName: "SessionCreated",
    logs: createReceipt.logs,
  });
  const sessionId = createdLogs[0].args.sessionId as `0x${string}`;
  console.log("SessionId:", sessionId);

  // player2 join
  console.log("Player2 joining...");
  const joinHash = await c2.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "joinSession",
    args: [sessionId],
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: joinHash });

  // commit/reveal: create commits
  const answers1 = ["A", "A", "A", "A", "A"];
  const answers2 = ["", "", "", "", ""];
  const salt1 = "0x" + "01".repeat(32);
  const salt2 = "0x" + "02".repeat(32);
  const joinAnswers = (arr: string[]) => arr.join("");
  const keccak = (s: string) => {
    const { keccak256 } = require("viem").hash;
    return keccak256(Buffer.from(s));
  };
  const commit1 = keccak(joinAnswers(answers1) + salt1.slice(2));
  const commit2 = keccak(joinAnswers(answers2) + salt2.slice(2));

  console.log("Commit from P1");
  const c1hash = await c1.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "commitAnswers",
    args: [sessionId, commit1],
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: c1hash });
  console.log("Commit from P2");
  const c2hash = await c2.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "commitAnswers",
    args: [sessionId, commit2],
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: c2hash });

  console.log("Reveal P1");
  const r1 = await c1.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "revealAnswers",
    args: [sessionId, answers1, salt1],
    gas: 500_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: r1 });
  console.log("Reveal P2");
  const r2 = await c2.writeContract({
    address: GAME,
    abi: gameAbi,
    functionName: "revealAnswers",
    args: [sessionId, answers2, salt2],
    gas: 500_000n,
  });
  const resRec = await publicClient.waitForTransactionReceipt({ hash: r2 });

  console.log("Reveal tx done, parsing SessionResolved...");
  const resolved = parseEventLogs({
    abi: gameAbi,
    eventName: "SessionResolved",
    logs: resRec.logs,
  });
  if (resolved.length > 0) {
    console.log("SessionResolved:", resolved[0].args);
  } else {
    console.log("No SessionResolved event found in reveal tx");
  }

  // check balances, pending PvP payout, and pending royalty
  const bal1After = await publicClient.readContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [a1.address],
  });
  const bal2After = await publicClient.readContract({
    address: IDRX,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [a2.address],
  });
  console.log(
    "Balances after: P1=",
    bal1After.toString(),
    "P2=",
    bal2After.toString(),
  );
  const pvpPending1 = await publicClient.readContract({
    address: GAME,
    abi: gameAbi,
    functionName: "pendingPvpPayout",
    args: [a1.address],
  });
  const pvpPending2 = await publicClient.readContract({
    address: GAME,
    abi: gameAbi,
    functionName: "pendingPvpPayout",
    args: [a2.address],
  });
  console.log(
    "Pending PvP payout: P1=",
    pvpPending1.toString(),
    "P2=",
    pvpPending2.toString(),
  );

  // read pendingRoyalty for contributor from question pool
  const qpAbi = [
    {
      type: "function",
      name: "questions",
      inputs: [{ name: "id", type: "uint256" }],
      outputs: [
        { name: "id", type: "uint256" },
        { name: "contributor", type: "address" },
        { name: "metadata", type: "string" },
        { name: "isVerified", type: "bool" },
        { name: "difficulty", type: "uint8" },
        { name: "played", type: "uint256" },
        { name: "earned", type: "uint256" },
      ],
      stateMutability: "view",
    },
  ];
  const q = await publicClient.readContract({
    address: QUESTION_POOL,
    abi: qpAbi,
    functionName: "questions",
    args: [1],
  });
  const contributor = q[1] as `0x${string}`;
  console.log("Contributor for q1:", contributor);

  const casualAbi = [
    {
      type: "function",
      name: "pendingRoyalty",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ];
  const pending = await publicClient.readContract({
    address: CASUAL,
    abi: casualAbi,
    functionName: "pendingRoyalty",
    args: [contributor],
  });
  console.log("Contributor pendingRoyalty:", pending.toString());

  // try withdraw as contributor via faucet (if contributor is faucet)
  if (contributor.toLowerCase() === faucet.address.toLowerCase()) {
    console.log("Contributor is faucet — withdrawing to confirm flow");
    const withdrawAbi = [
      {
        type: "function",
        name: "withdrawRoyalty",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ];
    const w = await faucetClient.writeContract({
      address: CASUAL,
      abi: withdrawAbi,
      functionName: "withdrawRoyalty",
      args: [],
    });
    await publicClient.waitForTransactionReceipt({ hash: w });
    const pendingAfter = await publicClient.readContract({
      address: CASUAL,
      abi: casualAbi,
      functionName: "pendingRoyalty",
      args: [contributor],
    });
    console.log("pending after withdraw:", pendingAfter.toString());
  }

  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
