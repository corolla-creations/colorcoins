/* eslint-disable no-console */
const fs = require("fs");
const { ethers } = require("hardhat");

// --- Minimal ERC20 ABI we need
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)"
];

// ---- helpers
function bpsShare(total, bps) { return (total * BigInt(bps)) / 10000n; }
function fmtUnits(n, dec) { return Number(ethers.formatUnits(n, dec)).toLocaleString(undefined, { maximumFractionDigits: 6 }); }

async function feeCaps() {
  const blk  = await ethers.provider.getBlock("pending");
  const base = blk?.baseFeePerGas ?? ethers.parseUnits("5", "gwei");
  const tip  = ethers.parseUnits(process.env.PRIORITY_GWEI || "2", "gwei");  // override with env if you want
  const maxF = base * BigInt(process.env.FEE_MULT || 2) + tip;               // default base*2 + tip
  return { base, tip, maxF };
}

async function main() {
  // --- 0) Network sanity
  const net = await ethers.provider.getNetwork();
  console.log("Network:", { name: net.name, chainId: Number(net.chainId) });
  if (Number(net.chainId) !== 1) {
    console.error("❌ Not on mainnet. Run with: --network mainnet");
    process.exit(1);
  }

  // --- 1) Load config
  const cfgPath = process.env.ALLOC_JSON || "config/alloc.json";
  if (!fs.existsSync(cfgPath)) {
    console.error(`❌ Missing ${cfgPath}.`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tokens = cfg.tokens || {};
  const dests  = cfg.destinations || {};
  const bps    = cfg.default_bps || {};

  // --- 2) Validate config
  const requiredBuckets = ["team", "staking", "lp", "treasury", "advisors"];
  for (const k of requiredBuckets) {
    if (typeof bps[k] !== "number") {
      console.error(`❌ default_bps.${k} missing`);
      process.exit(1);
    }
  }
  const sumBps = requiredBuckets.reduce((a,k)=>a + (bps[k]||0), 0);
  if (sumBps !== 10000) {
    console.error(`❌ default_bps must sum to 10000 (got ${sumBps})`);
    process.exit(1);
  }

  // Validate destination addresses (skip blanks)
  const destKeys = ["teamVesting", "advisorsVesting", "stakingReserve", "treasury"];
  for (const key of destKeys) {
    const v = dests[key];
    if (!v) {
      console.warn(`⚠️  Destination ${key} is empty; will be skipped.`);
      continue;
    }
    if (!ethers.isAddress(v)) {
      console.error(`❌ Destination ${key} is not a valid address: ${v}`);
      process.exit(1);
    }
  }

  // --- 3) Holder (sender)
  const [holder] = await ethers.getSigners();
  console.log("Holder (sender):", holder.address);

  // --- 4) Process each token
  for (const [label, addr] of Object.entries(tokens)) {
    if (!ethers.isAddress(addr)) {
      console.error(`❌ Token ${label} has invalid address: ${addr}`);
      continue;
    }

    console.log(`\n=== ${label} @ ${addr} ===`);
    const t = new ethers.Contract(addr, ERC20_ABI, holder);

    // Read token facts & balances
    const [name, sym, dec, total, balHolder] = await Promise.all([
      t.name().catch(() => label),
      t.symbol().catch(() => label),
      t.decimals().catch(() => 18),
      t.totalSupply(),
      t.balanceOf(holder.address),
    ]);

    console.log(`${name} (${sym}) dec=${dec} totalSupply=${fmtUnits(total, dec)}`);
    console.log(`holder balance: ${fmtUnits(balHolder, dec)} (raw: ${balHolder})`);

    // Compute amounts by bps
    const amtTeam     = bpsShare(total, bps.team);
    const amtAdvisors = bpsShare(total, bps.advisors);
    const amtStaking  = bpsShare(total, bps.staking);
    const amtTreasury = bpsShare(total, bps.treasury);
    const amtLP       = bpsShare(total, bps.lp);

    console.log(`plan (raw): team=${amtTeam} advisors=${amtAdvisors} staking=${amtStaking} treasury=${amtTreasury} lp=${amtLP}`);

    // Sanity: do we have enough to send for the 4 transfers?
    const needed = amtTeam + amtAdvisors + amtStaking + amtTreasury;
    if (balHolder < needed) {
      console.error(`❌ ${label}: holder balance (${balHolder}) < required for transfers (${needed}). Not sending.`);
      continue;
    }

    // Build steps (skip any blank destinations)
    const steps = [
      { label: "teamVesting",     to: dests.teamVesting,     amount: amtTeam     },
      { label: "advisorsVesting", to: dests.advisorsVesting, amount: amtAdvisors },
      { label: "stakingReserve",  to: dests.stakingReserve,  amount: amtStaking  },
      { label: "treasury",        to: dests.treasury,        amount: amtTreasury },
    ].filter(s => s.to && s.amount > 0n);

    if (steps.length === 0) {
      console.warn(`${label}: nothing to send (all destinations empty?).`);
      continue;
    }

    for (const s of steps) {
      // --- 4a) Preflight (ethers v6): staticCall
      try {
        const ok = await t.transfer.staticCall(s.to, s.amount);
        if (ok === false) throw new Error("transfer() returned false");
      } catch (err) {
        console.error(`❌ ${label}: ${s.label} would revert: ${err?.shortMessage || err?.message || err}`);
        continue; // don't send if simulation fails
      }

      // --- 4b) Estimate gas & set EIP-1559 caps
      let gasLimit;
      try {
        const est = await t.estimateGas.transfer(s.to, s.amount);
        gasLimit = (est * 12n) / 10n; // +20% buffer
      } catch {
        gasLimit = 80000n; // fallback for simple ERC20.transfer
      }
      const { base, tip, maxF } = await feeCaps();

      console.log(`→ ${label}: sending ${s.label} ${fmtUnits(s.amount, dec)} ${sym} to ${s.to}`);
      console.log(`   fees: base≈${Number(ethers.formatUnits(base, "gwei")).toFixed(2)} gwei, tip=${Number(ethers.formatUnits(tip, "gwei"))} gwei, cap=${Number(ethers.formatUnits(maxF, "gwei"))} gwei, gasLimit=${gasLimit}`);

      // --- 4c) Send
      const tx = await t.transfer(s.to, s.amount, {
        gasLimit,
        maxPriorityFeePerGas: tip,
        maxFeePerGas: maxF,
      });
      console.log(`   tx: ${tx.hash}`);
      await tx.wait(1);
      console.log(`   ✓ confirmed`);
    }

    console.log(`${label}: keep for LP (still in holder): ${fmtUnits(amtLP, dec)} ${sym}`);
  }

  console.log("\nAll done.");
}

// --- run
main().catch(e => { console.error(e); process.exit(1); });
