import type { Address } from "viem";

const questionPoolAddress = process.env
  .NEXT_PUBLIC_QUESTION_POOL_ADDRESS as Address;
const casualPoolAddress = process.env
  .NEXT_PUBLIC_CASUAL_POOL_ADDRESS as Address;
const gameSessionAddress = process.env
  .NEXT_PUBLIC_GAME_SESSION_ADDRESS as Address;
const mockUsdAddress = process.env.NEXT_PUBLIC_MOCK_USD_ADDRESS as Address;
const mockIdrxAddress = process.env.NEXT_PUBLIC_MOCK_IDRX_ADDRESS as Address;
// Active payment token for Monad testing = IDRX (2 decimals)
const paymentTokenAddress = process.env
  .NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS as Address;

export const questionPoolAbi = [
  {
    type: "function",
    name: "questionCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDailyCount",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVerifiedQuestions",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRandomQuestions",
    inputs: [
      { name: "count", type: "uint256" },
      { name: "seed", type: "uint256" },
    ],
    outputs: [{ name: "result", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "submitQuestion",
    inputs: [{ name: "ipfsHash", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "verifyQuestion",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "difficulty", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Note: `contributorQuestions` is a `mapping(address => uint256[])` in Solidity.
  // The compiler generates an accessor that takes an index: (address, uint256) -> uint256
  {
    type: "function",
    name: "contributorQuestions",
    inputs: [
      { name: "contributor", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "QuestionSubmitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "contributor", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "incrementDailyCount",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "questions",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "contributor", type: "address" },
      { name: "ipfsHash", type: "string" },
      { name: "isVerified", type: "bool" },
      { name: "difficulty", type: "uint8" },
      { name: "timesPlayed", type: "uint256" },
      { name: "royaltyEarned", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

export const casualPoolAbi = [
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [{ name: "contributor", type: "address" }],
  },
  {
    type: "error",
    name: "InvalidQuestionIds",
    inputs: [],
  },
  {
    type: "function",
    name: "payAndPlay",
    inputs: [{ name: "questionIds", type: "uint256[]" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawRoyalty",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pendingRoyalty",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CasualFeePaid",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "questionIds", type: "uint256[]", indexed: false },
    ],
  },
] as const;

export const gameSessionAbi = [
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [{ name: "player", type: "address" }],
  },
  {
    type: "function",
    name: "getQuestionIds",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256[10]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createSession",
    inputs: [
      { name: "wager", type: "uint256" },
      { name: "questionIds", type: "uint256[]" },
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
    type: "function",
    name: "resolveByRelayer",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "score1", type: "uint8" },
      { name: "score2", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "paymentToken",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimTimeout",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pendingPvpPayout",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdrawPvpPayout",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "SessionCreated",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "player1", type: "address", indexed: true },
      { name: "wager", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionResolved",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "winner", type: "address", indexed: false },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionTied",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "refundEach", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PvpPayoutAccumulated",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PvpPayoutWithdrawn",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "sessions",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "id", type: "bytes32" },
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
      { name: "wager", type: "uint256" },
      { name: "questionCount", type: "uint8" },
      { name: "commitHash1", type: "bytes32" },
      { name: "commitHash2", type: "bytes32" },
      { name: "score1", type: "uint8" },
      { name: "score2", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "playDeadline", type: "uint256" },
      { name: "revealDeadline", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

export const mockUsdAbi = [
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
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const questionPoolContract = {
  address: questionPoolAddress,
  abi: questionPoolAbi,
} as const;

export const casualPoolContract = {
  address: casualPoolAddress,
  abi: casualPoolAbi,
} as const;

export const gameSessionContract = {
  address: gameSessionAddress,
  abi: gameSessionAbi,
} as const;

export const mockUsdContract = {
  address: mockUsdAddress,
  abi: mockUsdAbi,
} as const;

export const mockIdrxAbi = [
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
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const mockIdrxContract = {
  address: mockIdrxAddress,
  abi: mockIdrxAbi,
} as const;

// Active payment token contract (IDRX on Monad)
export const paymentTokenContract = {
  address: paymentTokenAddress,
  abi: mockIdrxAbi,
} as const;
