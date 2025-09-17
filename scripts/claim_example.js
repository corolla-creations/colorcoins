require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const campaign = process.env.CAMPAIGN; // merkle or quest
  const symbol = process.env.SYMBOL;     // e.g., BLUE
  if (!campaign || !symbol) throw new Error("Set CAMPAIGN & SYMBOL env vars");

  const json = JSON.parse(fs.readFileSync(path.join("out", campaign, `${symbol}.json`), "utf8"));
  const [signer] = await ethers.getSigners();

  // Find this signer in the list
  const entry = json.recipients.find(r => r.account.toLowerCase() === signer.address.toLowerCase());
  if (!entry) throw new Error("This signer is not in the recipient list");

  const dist = await ethers.getContractAt("MerkleDistributor", json.distributor, signer);

  const tx = await dist.claim(entry.index, entry.account, entry.amount, entry.proof);
  console.log("Claim tx:", tx.hash);
  await tx.wait();
  console.log("Claimed!");
}

main().catch(e => { console.error(e); process.exit(1); });
