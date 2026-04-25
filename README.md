# Monad Blitz Jogja Submission Process

## Steps to prepare your project repo:

1. Visit the `monad-blitz-jogja` repo (link [here](https://github.com/monad-developers/monad-blitz-jogja)) and fork it.

![1.png](/screenshots/1.png)

2. Give it your project name, a one-liner description, make sure you are forking `main` branch and click `Create Fork`

![2.png](https://github.com/monad-developers/monad-blitz-denver/blob/main/screenshots/2.png?raw=true)

3. In your fork you can make all the changes you want, add code of your project, create branches, add information to `README.md` , you can change anything and everything.

4. # DuelPic - Picture Guessing Game

This is a 1v1 picture guessing game where players compete to guess the correct word for a series of images. The project is built on the Monad blockchain and includes smart contracts for game logic, a Next.js frontend, and various scripts for deployment and data seeding.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/en/) (v18 or later)
- [pnpm](https://pnpm.io/installation)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contract development and deployment)
- [Git](https://git-scm.com/downloads)

## Project Structure

- `/apps`: Contains the Next.js frontend application.
- `/sc`: Contains the Solidity smart contracts developed with Foundry.
- `/scripts`: Contains helper scripts for tasks like seeding data.

## Step-by-Step Guide to Run the Project

### 1. Clone the Repository

First, clone the project to your local machine.

```bash
git clone <YOUR_REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

### 2. Install Dependencies

Install all the necessary dependencies for both the frontend and smart contract development using `pnpm`. This command will also install the required Git submodules for the smart contracts.

```bash
pnpm install
```

### 3. Deploy Smart Contracts

The smart contracts need to be deployed to the Monad testnet. A deployment script is provided for this purpose.

```bash
cd sc
./deploy.sh
```

This script will:

1. Compile the smart contracts.
2. Deploy them to the Monad testnet.
3. Output the contract addresses and a block of environment variables.

### 4. Configure Environment Variables

After the deployment script finishes, it will print a block of environment variables for the frontend. Copy this entire block.

Open the `.env.local` file in the `/apps` directory (or create it if it doesn't exist) and paste the copied variables into it. Below is a complete template for your `.env.local` file.

```env
# -------------------------------------------------------------------------
# --- Smart Contract Addresses (output from './sc/deploy.sh') -----------
# -------------------------------------------------------------------------
# Paste the output from the deployment script here.
NEXT_PUBLIC_MOCK_USD_ADDRESS=0x...
NEXT_PUBLIC_MOCK_IDRX_ADDRESS=0x...
NEXT_PUBLIC_QUESTION_POOL_ADDRESS=0x...
NEXT_PUBLIC_CASUAL_POOL_ADDRESS=0x...
NEXT_PUBLIC_GAME_SESSION_ADDRESS=0x...
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x...


# -------------------------------------------------------------------------
# --- Third-Party Services & Keys -----------------------------------------
# -------------------------------------------------------------------------

# Private key for the account that will act as the relayer/faucet.
# This account needs to have testnet MON tokens to pay for gas fees.
# IMPORTANT: This is a sensitive key. Do not commit it to version control.
FAUCET_PRIVATE_KEY="your_relayer_or_faucet_private_key"

# Pinata JWT for uploading images to IPFS.
# Used by the seeding script.
# See: https://docs.pinata.cloud/docs/getting-started
PINATA_JWT="your_pinata_jwt"

# Upstash Redis credentials for caching and session management.
# Used by the API routes and seeding script.
# See: https://upstash.com/docs/redis/overall/get-started
UPSTASH_REDIS_REST_URL="your_upstash_redis_url"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"

# Google Gemini API Key for image verification.
# Used when contributors submit new questions.
# See: https://ai.google.dev/
GEMINI_API_KEY="your_gemini_api_key"


# -------------------------------------------------------------------------
# --- Application Configuration -------------------------------------------
# -------------------------------------------------------------------------

# The public gateway to use for fetching IPFS content.
# Defaults to Pinata's public gateway if not set.
NEXT_PUBLIC_IPFS_GATEWAY="https://gateway.pinata.cloud"

# The address of the platform that receives submission fees.
# This should typically be the same as the QuestionPool address.
NEXT_PUBLIC_PLATFORM_ADDRESS=0x...
```

**To get the required keys:**

- **`FAUCET_PRIVATE_KEY`**: This is the private key of an Ethereum-style account that you control. You will need to fund this account with testnet MON tokens to cover the gas fees for on-chain transactions it submits, like resolving PvP matches.
- **`PINATA_JWT`**: Sign up for a [Pinata](https://pinata.cloud/) account. Go to the "API Keys" section and create a new key. Use the JWT value.
- **`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`**: Create a free Redis database on [Upstash](https://upstash.com/). You will find these credentials on your database's dashboard.
- **`GEMINI_API_KEY`**: Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

Fill in all the variables in your `apps/.env.local` file before proceeding to the next step.

### 5. Seed Questions and Images

With the contracts deployed and the environment configured, you need to populate the `QuestionPool` contract with initial data (images and answers).

Navigate to the `apps` directory and run the seeding script.

```bash
cd apps
npx tsx scripts/seed-questions.ts
```

This script will:

1. Read the sample answers from `apps/scripts/seed-data/answers.json`.
2. Upload the corresponding images from `apps/scripts/seed-data/images` to IPFS via Pinata.
3. Submit the questions (IPFS hash and answer) to the `QuestionPool` smart contract.
4. Verify the questions on-chain.

### 6. Run the Frontend Application

Finally, you can run the Next.js development server.

```bash
# Still inside the /apps directory
pnpm dev
```

Open your browser and navigate to `http://localhost:3000` to see the application running.

## Deploying the Frontend to Production

The frontend is a standard Next.js application and can be deployed to any platform that supports Node.js, such as Vercel or Netlify.

1. **Connect Your Git Repository:** Connect your GitHub/GitLab repository to your hosting provider (e.g., Vercel).
2. **Configure Build Settings:** The platform will usually auto-detect that it's a Next.js project. The standard build command is `pnpm build` and the output directory is `.next`.
3. **Add Environment Variables:** Add all the environment variables from your `.env.local` file to the project settings on your hosting provider. **Do not commit your `.env.local` file to Git.**

The application will then be built and deployed.
