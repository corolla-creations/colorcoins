require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const keccak256 = require("keccak256");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function zeroPad(hex, bytes) {
  return ethers.zeroPadValue(hex, bytes);
}
function toLeaf(index, account, amount) {
  return keccak256(
    Buffer.concat([
      Buffer.from(zeroPad(ethers.toBeHex(index), 32).slice(2), "hex"),
      Buffer.from(zeroPad(account, 32).slice(2), "hex"),
      Buffer.from(zeroPad(ethers.toBeHex(amount), 32).slice(2), "hex"),
    ])
  );
}
function buildTree(leaves) {
  let level = leaves.map((b) => Buffer.from(b)).sort(Buffer.compare);
  const layers = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) next.push(level[i]);
      else {
        const a = level[i], b = level[i + 1];
        const pair = Buffer.compare(a, b) < 0 ? Buffer.concat([a, b]) : Buffer.concat([b, a]);
        next.push(keccak256(pair));
      }
    }
    level = next;
    layers.push(level);
  }
  return { root: layers[layers.length - 1][0], layers };
}
function getProof(layers, leaf) {
  const proof = [];
  let idx = layers[0].findIndex((n) => n.equals(leaf));
  if (idx === -1) throw new Error("Leaf not found");
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRightNode = idx % 2;
    const pairIndex = isRightNode ? idx - 1 : idx + 1;
    if (pairIndex < layer.length) {
      proof.push("0x" + layer[pairIndex].toString("hex"));
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}

async function main() {
  const campaign = process.env.CAMPAIGN; // "merkle" or "quest"
  if (!campaign || !["merkle", "quest"].includes(campaign)) {
    throw new Error('Set CAMPAIGN=merkle or CAMPAIGN=quest');
  }

  const recipientsPath = path.join("lists", `${campaign}_recipients.txt`);
  if (!fs.existsSync(recipientsPath)) throw new Error(`Missing ${recipientsPath}`);
  const recipients = fs.readFileSync(recipientsPath, "utf8")
    .split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(ethers.getAddress);

  const cfg = JSON.parse(fs.readFileSync(path.join("config", "colorcoins.config.json"), "utf8"));
  const decimals = Number(cfg.decimals);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  await ethers.run("compile");
  const Distributor = await ethers.getContractFactory("MerkleDistributor");
  const outDir = path.join("out", campaign);
  fs.mkdirSync(outDir, { recursive: true });

  for (const t of cfg.tokens) {
    const sym = t.symbol;
    const token = new ethers.Contract(t.address, ERC20_ABI, deployer);
    const onchainDecimals = await token.decimals().catch(() => decimals);
    if (onchainDecimals !== decimals) console.warn(`[${sym}] decimals onchain=${onchainDecimals} config=${decimals}`);

    // convert allocation to base units
    const allocationUnits = ethers.parseUnits(t.allocations[campaign], decimals);

    // compute per-recipient
    const N = BigInt(recipients.length);
    if (N === 0n) { console.log(`[${sym}] No recipients; skipping`); continue; }
    const per = allocationUnits / N;
    if (per === 0n) { console.log(`[${sym}] Allocation too small per recipient; skipping`); continue; }
    const total = per * N; // ignore dust remainder

    console.log(`\n[${sym}] ${campaign} recipients=${recipients.length} per=${ethers.formatUnits(per, decimals)} total=${ethers.formatUnits(total, decimals)}`);

    // build leaves
    const leaves = recipients.map((addr, i) => toLeaf(i, addr, per));
    const { root, layers } = buildTree(leaves);
    const rootHex = "0x" + root.toString("hex");

    // deploy distributor
    const dist = await Distributor.deploy(t.address, rootHex);
    await dist.waitForDeployment();
    const distAddr = await dist.getAddress();
    console.log(`[${sym}] Distributor: ${distAddr}`);

    // fund distributor
    const bal = await token.balanceOf(deployer.address);
    if (bal < total) throw new Error(`[${sym}] insufficient balance; need ${ethers.formatUnits(total, decimals)}`);
    const tx = await token.transfer(distAddr, total);
    await tx.wait();
    console.log(`[${sym}] Funded with ${ethers.formatUnits(total, decimals)}`);

    // write JSON (includes proofs for each recipient)
    const entries = recipients.map((addr, i) => {
      const l = leaves[i];
      const proof = getProof(layers, l);
      return {
        index: i,
        account: addr,
        amount: per.toString(),
        proof
      };
    });

    const out = {
      token: t.address,
      symbol: sym,
      decimals,
      distributor: distAddr,
      merkleRoot: rootHex,
      perRecipient: per.toString(),
      recipients: entries
    };
    fs.writeFileSync(path.join(outDir, `${sym}.json`), JSON.stringify(out, null, 2));
    console.log(`[${sym}] Wrote ${path.join(outDir, sym + ".json")}`);
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
