ColorCoins — Proof of Paint (1:1 Burn-on-Claim Staking)

Overview
- Six ERC20 tokens with fixed caps and coordinated 1:1 reward rules.
- Proof of Paint: lock for 90 days, then burn the locked token(s) and receive reward token(s) 1:1 from pre‑funded budgets.
- Vesting vault for team/advisors with cliff and linear release.

Tokens (18 decimals)
- Yellow Coin (`YELLOW`): cap 222,222,222,222
- Red Coin (`RED`): cap 222,222,222,222
- Green Coin (`GREEN`): cap 222,222,222
- Blue Coin (`BLUE`): cap 222,222,222,222
- Orange Coin (`ORANGE`): cap 222,222,222
- Purple Coin (`PURPLE`): cap 222,222,222

Initial Allocation Targets (guidance)
- Creator/Team: 15% (vested 4 years, 1-year cliff)
- Staking/Rewards: 35% (emissions over 3–5 years, decaying schedule)
- Liquidity Pool (LP): 10–15% (seed and lock or protocol-owned)
- Treasury/Ecosystem: 35–40% (listings, MM, grants, audits, partnerships)
- Advisors/Partners: 2–5% (vested 2 years)

Contracts
- `contracts/tokens/*.sol`: OpenZeppelin ERC20 (Burnable, Capped). Each mints full cap to `initialHolder` (or deployer if zero) and is Ownable.
- `contracts/staking/ProofOfPaint.sol`: Canonical staking. Users lock, then at claim time (>= 90 days) the locked tokens are burned and rewards are paid 1:1 from funded budgets. Roles for operator/pauser. This is the only reward mechanism.
- `contracts/vesting/VestingVault.sol`: Cliff + linear vesting vault using OZ Ownable + SafeERC20.

Staking Rules — Proof of Paint (only mechanism)
- Lock equal amounts for 90 days, then claim:
  - BLUE + YELLOW: burn both, receive GREEN 1:1
  - RED + YELLOW: burn both, receive ORANGE 1:1
  - BLUE + RED: burn both, receive PURPLE 1:1
- Lock single tokens for 90 days, then claim:
  - PURPLE: burn PURPLE, receive RED 1:1 and BLUE 1:1
  - GREEN: burn GREEN, receive YELLOW 1:1 and BLUE 1:1
  - ORANGE: burn ORANGE, receive YELLOW 1:1 and RED 1:1
- Early withdraw before 90 days returns locked tokens; no burn, no rewards.

Mechanics
- Users approve tokens and call `stakePair(pid, amount)` or `stakeSingle(pid, amount)`.
- Tokens transfer to the contract and are locked for 90 days.
- On `claim(pid)`, the contract burns the locked token(s) and transfers rewards from its funded balance scaled by a time factor in [0,1]. The factor is 1 (full reward) at ≥ 90 days, and follows a configurable exponential-like curve before 90 days.
- On `earlyWithdraw(pid)`, locked tokens are returned and the position is closed with no reward (optional escape hatch).
- Operator funds reward tokens to the contract with `fundReward(pid, token, amount)`.

Emissions
- Not used in Proof of Paint. Rewards are strictly 1:1 at claim time and paid from funded balances.

Reward Curve (Sigmoid Clamp)
- ProofOfPaint stores a 91-point lookup table (days 0..90), scaled by 1e6. The constructor seeds values from the normalized sigmoid ramp `y = [(1/(1+e^{-k(t-45)}) - σ(0))] / [σ(90) - σ(0)]` with `k = 0.1`, so day 0 = 0, day 90 = 1.
- To change the curve post-deploy, call `setRewardCurve` with a new array of 91 ascending values (0 → 1_000_000). Use a script (e.g. `npm run curve:gen`) to compute alternatives if you need a different shape.

Deployment (Hardhat)
1) Install and compile
   - `npm install`
   - `npm run compile`
2) Deploy tokens + ProofOfPaint and set roles/ownership
 - Copy `config/roles.example.json` to `config/roles.json` and fill addresses.
  - (Optional) Add `deployGasLimit`, `deployGasLimitToken`, or `deployGasLimitPop` if your RPC struggles to estimate gas. These are numeric values in wei.
   - `npx hardhat run scripts/deploy_proof_of_paint.js --network <net>`
3) Configure pools and fund rewards
   - Copy `config/pop.example.json` to `config/pop.json` and fill token addresses, pools, and funding amounts.
   - `node scripts/configure_proof_of_paint.js config/pop.json`
4) Vesting
   - Deploy `VestingVault` per beneficiary; transfer token allocations to each vault.
5) Liquidity & treasury
   - Transfer 10–15% to LP manager; 35–40% to Treasury multisig.

Operations: Roles, Timelock, Multisig
- Roles (AccessControl):
  - `OPERATOR_ROLE`: `fundReward`
  - `PAUSER_ROLE`: `pause`, `unpause`
  - Owner (Ownable): adding pools; should be a timelock/multisig
- TimelockController (recommended):
  - Deploy: `node scripts/deployTimelock.js config/timelock.json` (see `config/timelock.example.json`)
  - Use as owner: set in `config/roles.json` or pass existing address to the deployment script
- Role setup:
  - `node scripts/setupRoles.js config/roles.json` (supports granting DEFAULT_ADMIN_ROLE and revoking deployer)
- Token ownership:
  - `node scripts/transferTokenOwnership.js config/tokens.json`

Important
- Rewards must be funded to ProofOfPaint; it never mints.
- Burns are irreversible and reduce supply.
- Lock period is 90 days. Early withdrawal returns tokens with no rewards.

Security
- ReentrancyGuard, CEI ordering, Pausable, role split in place.
- Use timelock + multisig for owner and admin roles.
- Get an external audit before mainnet.
