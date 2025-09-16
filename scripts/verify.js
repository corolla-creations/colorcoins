const hre = require("hardhat");
const fs = require("fs");

// Usage: npx hardhat run scripts/verify.js --network <net> [deployments/latest.json]
async function main() {
  const path = process.argv[2] || "deployments/latest.json";
  if (!fs.existsSync(path)) throw new Error(`Missing deployments file at ${path}`);
  const addrs = JSON.parse(fs.readFileSync(path, "utf8"));

  // This script assumes tokens were deployed with a single constructor arg: initialHolder
  // You can pass HOLDER via env to override if needed.
  const holder = process.env.INITIAL_HOLDER || undefined;
  if (!holder) console.warn("No INITIAL_HOLDER provided; using deploy script's holder is recommended.");

  const toVerify = [];
  if (addrs.BLUE) toVerify.push({ address: addrs.BLUE, args: [holder].filter(Boolean) });
  if (addrs.RED) toVerify.push({ address: addrs.RED, args: [holder].filter(Boolean) });
  if (addrs.YELLOW) toVerify.push({ address: addrs.YELLOW, args: [holder].filter(Boolean) });
  if (addrs.GREEN) toVerify.push({ address: addrs.GREEN, args: [holder].filter(Boolean) });
  if (addrs.ORANGE) toVerify.push({ address: addrs.ORANGE, args: [holder].filter(Boolean) });
  if (addrs.PURPLE) toVerify.push({ address: addrs.PURPLE, args: [holder].filter(Boolean) });
  if (addrs.STAKING) toVerify.push({ address: addrs.STAKING, args: [] });
  if (addrs.TIMELOCK) {
    console.warn("Note: Timelock verification requires its original constructor args; use deploy.js verify or set VERIFY_TIMELOCK_* env vars.");
  }

  for (const v of toVerify) {
    try {
      await hre.run("verify:verify", { address: v.address, constructorArguments: v.args });
      console.log("Verified:", v.address);
    } catch (e) {
      console.warn("Verify failed for", v.address, e.message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

