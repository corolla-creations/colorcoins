// scripts/check_balances.js
/* eslint-disable no-console */
const fs = require("fs");
const { ethers } = require("hardhat");

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
];

function fmt(n, dec) {
  return Number(ethers.formatUnits(n, dec)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

async function main() {
  // 1) Load config
  const cfgPath = process.env.ALLOC_JSON || "config/alloc.json";
  if (!fs.existsSync(cfgPath)) {
    console.error(`❌ Missing ${cfgPath}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tokens = cfg.tokens || {};
  const dests  = cfg.destinations || {};

  // 2) Figure out who to treat as HOLDER (default: first signer; override with env)
  let holder = process.env.HOLDER;
  if (!holder) {
    const [signer] = await ethers.getSigners();
    holder = signer.address;
  }

  const net = await ethers.provider.getNetwork();
  console.log("Network:", { name: net.name, chainId: Number(net.chainId) });
  console.log("HOLDER:", holder);

  // 3) Address book we’ll print balances for
  const ADDRS = {
    HOLDER:          holder,
    TEAM_VESTING:    dests.teamVesting,
    ADVISORS_VESTING:dests.advisorsVesting,
    STAKING_RESERVE: dests.stakingReserve,
    TREASURY:        dests.treasury
  };

  // 4) Iterate tokens and print balances
  for (const [label, tokenAddr] of Object.entries(tokens)) {
    if (!ethers.isAddress(tokenAddr)) {
      console.error(`❌ Token ${label} has invalid address: ${tokenAddr}`);
      continue;
    }
    const t = new ethers.Contract(tokenAddr, ERC20_ABI, ethers.provider);
    const [name, sym, dec] = await Promise.all([
      t.name().catch(() => label),
      t.symbol().catch(() => label),
      t.decimals().catch(() => 18)
    ]);

    console.log(`\n=== ${label} (${sym}) @ ${tokenAddr} ===`);
    for (const [who, addr] of Object.entries(ADDRS)) {
      if (!addr || !ethers.isAddress(addr)) continue;
      const bal = await t.balanceOf(addr);
      console.log(`${who.padEnd(16)} ${addr} → ${fmt(bal, dec)} ${sym}`);
    }
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
