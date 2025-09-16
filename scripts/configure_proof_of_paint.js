const { ethers } = require("hardhat");
const fs = require("fs");

// Usage: HARDHAT_NETWORK=<net> node scripts/configure_proof_of_paint.js config/pop.json
// pop.json example:
// {
//   "pop": "0xPoP",
//   "pools": [
//     { "pid": 0, "fund": [{ "token": "0xGREEN", "amount": "1000000000000000000000" }] },
//     { "pid": 3, "fund": [
//         { "token": "0xRED", "amount": "500000000000000000000" },
//         { "token": "0xBLUE", "amount": "500000000000000000000" }
//     ]}
//   ]
// }

async function main() {
  const path = process.argv[2] || "config/pop.json";
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
  const pop = await ethers.getContractAt("ProofOfPaint", cfg.pop);
  for (const p of cfg.pools) {
    if (p.fund) {
      for (const f of p.fund) {
        const token = await ethers.getContractAt("IERC20", f.token);
        const amt = BigInt(f.amount);
        await (await token.approve(cfg.pop, amt)).wait();
        await (await pop.fundReward(p.pid, token.target, amt)).wait();
        console.log(`Funded pid=${p.pid} with ${f.token} amount=${f.amount}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

