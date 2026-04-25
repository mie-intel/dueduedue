#!/usr/bin/env -S bash
set -euo pipefail

# ── config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SC_ENV="$SCRIPT_DIR/.env"
APPS_ENV="$SCRIPT_DIR/../apps/.env.local"
RPC="https://testnet-rpc.monad.xyz"
CHAIN_ID=10143
EXPLORER_URL="https://api.etherscan.io/v2/api?chainid=$CHAIN_ID&"

# Load env from sc/.env
if [[ ! -f "$SC_ENV" ]]; then
  echo "ERROR: sc/.env not found" >&2; exit 1
fi
set -a; source "$SC_ENV"; set +a

if [[ -z "${MONAD_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: MONAD_PRIVATE_KEY not in sc/.env" >&2; exit 1
fi
if [[ -z "${ETH_API_KEY:-}" ]]; then
  echo "ERROR: ETH_API_KEY not in sc/.env" >&2; exit 1
fi

# ── deploy ───────────────────────────────────────────────────────────────────
echo "==> Deploying to Monad testnet (chain $CHAIN_ID)..."

DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol \
  --rpc-url "$RPC" \
  --broadcast \
  --private-key "$MONAD_PRIVATE_KEY" \
  -vvv \
  2>&1)

echo "$DEPLOY_OUTPUT"

# ── extract addresses ────────────────────────────────────────────────────────
extract() { echo "$DEPLOY_OUTPUT" | grep "$1" | awk '{print $NF}'; }

MOCK_USD=$(extract "MockUSD proxy")
MOCK_IDRX=$(extract "MockIDRX proxy")
QUESTION_POOL=$(extract "QuestionPool proxy")
CASUAL_POOL=$(extract "CasualPool proxy")
GAME_SESSION=$(extract "GameSession proxy")

if [[ -z "$CASUAL_POOL" ]]; then
  echo "ERROR: Could not parse addresses from deploy output"
  exit 1
fi

echo ""
echo "==> New addresses:"
echo "  MockUSD:       $MOCK_USD"
echo "  MockIDRX:      $MOCK_IDRX"
echo "  QuestionPool:  $QUESTION_POOL"
echo "  CasualPool:    $CASUAL_POOL"
echo "  GameSession:   $GAME_SESSION"

# ── update .env.local ────────────────────────────────────────────────────────
echo ""
echo "==> Updating env files..."

update_env() {
  local file="$1" key="$2" val="$3"
  if grep -q "^$key=" "$file"; then
    sed -i "s|^$key=.*|$key=$val|" "$file"
  else
    echo "$key=$val" >> "$file"
  fi
}

for file in "$SC_ENV" "$APPS_ENV"; do
  [[ -f "$file" ]] || continue
  update_env "$file" "NEXT_PUBLIC_MOCK_USD_ADDRESS"      "$MOCK_USD"
  update_env "$file" "NEXT_PUBLIC_MOCK_IDRX_ADDRESS"     "$MOCK_IDRX"
  update_env "$file" "NEXT_PUBLIC_QUESTION_POOL_ADDRESS" "$QUESTION_POOL"
  update_env "$file" "NEXT_PUBLIC_CASUAL_POOL_ADDRESS"   "$CASUAL_POOL"
  update_env "$file" "NEXT_PUBLIC_GAME_SESSION_ADDRESS"  "$GAME_SESSION"
  update_env "$file" "NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS" "$MOCK_IDRX"
  echo "    updated: $file"
done

# ── get impl addresses ────────────────────────────────────────────────────────
echo ""
echo "==> Reading implementation addresses (EIP-1967 slot)..."

impl_slot="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
get_impl() {
  cast storage "$1" "$impl_slot" --rpc-url "$RPC" 2>/dev/null \
    | awk '{ printf "0x%s\n", substr($0, length($0)-39) }'
}

MOCK_USD_IMPL=$(get_impl "$MOCK_USD")
MOCK_IDRX_IMPL=$(get_impl "$MOCK_IDRX")
QUESTION_POOL_IMPL=$(get_impl "$QUESTION_POOL")
CASUAL_POOL_IMPL=$(get_impl "$CASUAL_POOL")
GAME_SESSION_IMPL=$(get_impl "$GAME_SESSION")

# ── sourcify verification ─────────────────────────────────────────────────────
echo ""
echo "==> Trying Sourcify verification (no Cloudflare issue)..."

verify_sourcify() {
  local addr="$1" contract="$2"
  echo "  $contract ($addr)"
  forge verify-contract "$addr" "$contract" \
    --chain-id "$CHAIN_ID" \
    --verifier etherscan \
    --verifier-url "$EXPLORER_URL" \
    --etherscan-api-key "$ETH_API_KEY" \
    --watch \
    2>&1 | tail -3 || true
}

verify_sourcify "$MOCK_USD_IMPL"      "src/MockUSD.sol:MockUSD"
verify_sourcify "$MOCK_IDRX_IMPL"     "src/MockIDRX.sol:MockIDRX"
verify_sourcify "$QUESTION_POOL_IMPL" "src/QuestionPool.sol:QuestionPool"
verify_sourcify "$CASUAL_POOL_IMPL"   "src/CasualPool.sol:CasualPool"
verify_sourcify "$GAME_SESSION_IMPL"  "src/GameSession.sol:GameSession"

# ── manual verify fallback ────────────────────────────────────────────────────
echo ""
echo "==> Manual verify (Monad explorer, if Sourcify fails):"
echo "    Then paste at: https://testnet.monadexplorer.com/address/<impl_addr>/contract-verification"
echo "    Flattened source: forge flatten src/<Contract>.sol > flat.sol"
echo ""
echo "    Impl addresses to verify:"
echo "      MockUSD:      $MOCK_USD_IMPL"
echo "      MockIDRX:     $MOCK_IDRX_IMPL"
echo "      QuestionPool: $QUESTION_POOL_IMPL"
echo "      CasualPool:   $CASUAL_POOL_IMPL"
echo "      GameSession:  $GAME_SESSION_IMPL"

echo ""
echo "==> Clearing Redis (stale question data from old deploy)..."
node -e "
require('dotenv').config({ path: '$APPS_ENV' });
const { Redis } = require('@upstash/redis');
const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
r.flushall().then(() => { console.log('    Redis cleared'); process.exit(0); }).catch(e => { console.error('    Redis clear failed:', e.message); process.exit(0); });
" 2>/dev/null || echo "    (skip — node/redis not available from sc/)"

echo ""
echo "==> Done. Re-seed questions:"
echo "    cd ../apps && pnpm tsx scripts/seed-questions.ts"
