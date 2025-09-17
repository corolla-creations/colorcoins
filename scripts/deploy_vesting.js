// scripts/deploy_vesting.js (ethers v6)
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  // >>>> fill these in <<<<
  const TEAM_SAFE = "0xYourTeamSafe";       // beneficiary
  const START  = Math.floor(Date.now()/1000) + 365*24*3600;  // e.g., start after 1y cliff
  const DURA   = 4 * 365 * 24 * 3600;       // 4 years linear

  const VW = await ethers.getContractFactory("VestingWallet"); // from @openzeppelin/contracts/finance/VestingWallet.sol
  const vw = await VW.deploy(TEAM_SAFE, START, DURA);

  const tx = vw.deploymentTransaction();
  console.log("Vesting deploy tx:", tx.hash);
  await tx.wait(1);
  console.log("VestingWallet:", await vw.getAddress());
}
main().catch(e => { console.error(e); process.exit(1); });
