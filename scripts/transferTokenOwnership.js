const { ethers } = require("hardhat");
const fs = require("fs");

// Usage: HARDHAT_NETWORK=<net> node scripts/transferTokenOwnership.js config/tokens.json
// tokens.json example:
// {
//   "owner": "0xNewOwner",
//   "tokens": {
//     "blue": "0xBlue",
//     "red": "0xRed",
//     "yellow": "0xYellow",
//     "green": "0xGreen",
//     "orange": "0xOrange",
//     "purple": "0xPurple"
//   }
// }

async function main() {
  const cfgPath = process.argv[2] || "config/tokens.json";
  if (!fs.existsSync(cfgPath)) throw new Error(`Missing tokens config at ${cfgPath}`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (!cfg.owner || !cfg.tokens) throw new Error("Config must include 'owner' and 'tokens' map");

  const [signer] = await ethers.getSigners();
  const entries = Object.entries(cfg.tokens);
  for (const [name, addr] of entries) {
    const c = await ethers.getContractAt("Ownable", addr);
    await (await c.transferOwnership(cfg.owner)).wait();
    console.log(`Transferred ${name} ownership to ${cfg.owner}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

