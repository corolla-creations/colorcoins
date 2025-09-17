/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const TOKENS = {
    BLUE:   "0x8DcC9141e89848E4B85Bb42cb6bA9A2eB079AD74",
    RED:    "0x6a639EdD7d6B770BeD0eB9c3e60fb5348620ecA1",
    YELLOW: "0x1334D7BDB88044D1E863bA0507B94d5666251eca",
    GREEN:  "0x5d42EE1dF7424741E923E5CcBc1D4ea82E402d7B",
    ORANGE: "0x92FA85D004298EC0D81Fdc95520C2c04Fa9F9345",
    PURPLE: "0x6Af7d8eea65942fb982d2EB0D94AFae5d03891DD"
  };
  const BENEFICIARY = "0x8366Fd36Ef539d246CBc3A1b41e37c55c03871aC";

  for (const [name, addr] of Object.entries(TOKENS)) {
    if (!ethers.isAddress(addr)) throw new Error(`${name} token invalid: ${addr}`);
  }
  if (!ethers.isAddress(BENEFICIARY)) throw new Error(`BENEFICIARY invalid: ${BENEFICIARY}`);

  const NOW = Math.floor(Date.now()/1000);
  const START = NOW + 365*24*3600;  // 1y cliff
  const CLIFF = 365*24*3600;
  const DURATION = 4*365*24*3600;

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const blk  = await ethers.provider.getBlock("pending");
  const base = blk?.baseFeePerGas ?? ethers.parseUnits("5","gwei");
  const tip  = ethers.parseUnits("2","gwei");
  const maxF = base * 2n + tip;

  const F = await ethers.getContractFactory("VestingVault");
  const out = {};

  for (const [label, token] of Object.entries(TOKENS)) {
    const v = await F.deploy(token, BENEFICIARY, START, CLIFF, DURATION, {
      maxPriorityFeePerGas: tip, maxFeePerGas: maxF
    });
    console.log(`${label} tx:`, v.deploymentTransaction().hash);
    await v.waitForDeployment();
    out[label] = await v.getAddress();
    console.log(`${label} Vault:`, out[label]);
  }
  console.log("Vaults:", out);
}
main().catch((e) => { console.error(e); process.exit(1); });
