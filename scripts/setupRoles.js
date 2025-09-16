const { ethers } = require("hardhat");
const fs = require("fs");

// Usage: HARDHAT_NETWORK=<net> node scripts/setupRoles.js config/roles.json
// roles.json fields:
// {
//   "staking": "0x...",             // required
//   "owner": "0x...",               // optional; transfer ownership
//   "operator": "0x...",            // optional; grant OPERATOR_ROLE
//   "pauser": "0x...",              // optional; grant PAUSER_ROLE
//   "revokeDeployerRoles": true,     // optional; revoke deployer OPERATOR/PAUSER
//   "defaultAdmin": "0x...",        // optional; grant DEFAULT_ADMIN_ROLE to this address
//   "revokeDeployerAdmin": true      // optional; revoke deployer DEFAULT_ADMIN_ROLE
// }

async function main() {
  const cfgPath = process.argv[2] || "config/roles.json";
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`Missing roles config at ${cfgPath}`);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (!cfg.staking) throw new Error("roles config must include 'staking' address");

  const [deployer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("ColorStaking", cfg.staking);
  const OPERATOR_ROLE = await staking.OPERATOR_ROLE();
  const PAUSER_ROLE = await staking.PAUSER_ROLE();
  const DEFAULT_ADMIN_ROLE = await staking.DEFAULT_ADMIN_ROLE();

  if (cfg.operator) {
    await (await staking.grantRole(OPERATOR_ROLE, cfg.operator)).wait();
    console.log("Granted OPERATOR_ROLE to", cfg.operator);
  }
  if (cfg.pauser) {
    await (await staking.grantRole(PAUSER_ROLE, cfg.pauser)).wait();
    console.log("Granted PAUSER_ROLE to", cfg.pauser);
  }
  if (cfg.owner) {
    await (await staking.transferOwnership(cfg.owner)).wait();
    console.log("Transferred ownership to", cfg.owner);
  }
  if (cfg.revokeDeployerRoles) {
    await (await staking.revokeRole(OPERATOR_ROLE, deployer.address)).wait();
    await (await staking.revokeRole(PAUSER_ROLE, deployer.address)).wait();
    console.log("Revoked deployer OPERATOR/PAUSER roles");
  }
  if (cfg.defaultAdmin) {
    await (await staking.grantRole(DEFAULT_ADMIN_ROLE, cfg.defaultAdmin)).wait();
    console.log("Granted DEFAULT_ADMIN_ROLE to", cfg.defaultAdmin);
  }
  if (cfg.revokeDeployerAdmin) {
    await (await staking.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    console.log("Revoked deployer DEFAULT_ADMIN_ROLE");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
