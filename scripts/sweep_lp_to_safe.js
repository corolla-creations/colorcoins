/* eslint-disable no-console */
const { ethers } = require("hardhat");

// Pair (LP) addresses printed by your run:
const PAIRS = [
  "0x23B37f57aC8113b98f2802f73Bc322A936Bf422d", // BLUE/WETH
  "0x3676CFd543d9d2069153D6E713643Bb72e6e4344", // RED/WETH
  "0x0C84488b2516Ef6b752147ee838c1a8b65c8D1ED", // YELLOW/WETH
  "0x00E6f3d5DF32F0c3FE8F7D237f1C8190376536d1", // GREEN/WETH
  "0x6351FdeeF5A108277bf127A5B25fbDb08bD5feCd"  // ORANGE/WETH
  // (no PURPLE yet)
];

const LP_RECIPIENT = "0x3862366cee2aCbF4017c2DA6A337Cd12EF1fDFCB"; // your LP Safe

const LP_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function symbol() view returns (string)"
];

async function main() {
  const [me] = await ethers.getSigners();
  const blk  = await ethers.provider.getBlock("pending");
  const base = blk?.baseFeePerGas ?? ethers.parseUnits("5","gwei");
  const tip  = ethers.parseUnits(process.env.PRIORITY_GWEI || "2","gwei");
  const maxF = base * 2n + tip;

  for (const pair of PAIRS) {
    const lp = new ethers.Contract(pair, LP_ABI, me);
    const [sym, bal] = await Promise.all([lp.symbol().catch(()=> "UNI-V2"), lp.balanceOf(me.address)]);
    if (bal === 0n) { console.log(`${sym}@${pair}: no LP to move`); continue; }
    console.log(`Moving ${sym} ${bal.toString()} → ${LP_RECIPIENT}`);
    try {
      const tx = await lp.transfer(LP_RECIPIENT, bal, { maxPriorityFeePerGas: tip, maxFeePerGas: maxF });
      console.log("  tx:", tx.hash);
      await tx.wait(1);
      console.log("  ✓ moved");
    } catch (e) {
      console.warn("  transfer failed, try again later:", e?.shortMessage || e?.message);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
