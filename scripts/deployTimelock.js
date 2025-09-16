const { ethers } = require("hardhat");
const fs = require("fs");

// Usage: HARDHAT_NETWORK=<net> node scripts/deployTimelock.js config/timelock.json
// timelock.json example:
// {
//   "minDelay": 3600,
//   "proposers": ["0xMultisigOrProposer"],
//   "executors": ["0xMultisigOrExecutor"],
//   "admin": "0xAdminForTimelock" // optional; defaults to deployer
// }

async function main() {
  const cfgPath = process.argv[2] || "config/timelock.json";
  if (!fs.existsSync(cfgPath)) throw new Error(`Missing timelock config at ${cfgPath}`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const minDelay = BigInt(cfg.minDelay || 3600);
  const proposers = cfg.proposers || [];
  const executors = cfg.executors || [];
  const [deployer] = await ethers.getSigners();
  const admin = cfg.admin || deployer.address;

  const Timelock = await ethers.getContractFactory("@openzeppelin/contracts/governance/TimelockController.sol:TimelockController");
  const t = await Timelock.deploy(minDelay, proposers, executors, admin);
  await t.waitForDeployment();
  console.log("Timelock deployed at:", await t.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
