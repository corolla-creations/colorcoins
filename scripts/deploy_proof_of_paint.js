// scripts/deploy_proof_of_paint.js
/* eslint-disable no-console */
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // ---- Load roles (optional knobs; never used to LOWER fees)
  let roles = {};
  if (fs.existsSync("config/roles.json")) {
    roles = JSON.parse(fs.readFileSync("config/roles.json", "utf8"));
  }
  const holder = roles.tokenOwner || deployer.address;

  const parseGwei = (v) => ethers.parseUnits(String(v), "gwei");

  // ---- Dynamic fee caps with sane floors (EIP-1559)
  async function resolveFeeCaps() {
    const blk  = await ethers.provider.getBlock("pending");
    const base = blk.baseFeePerGas ?? ethers.parseUnits("5", "gwei");

    // Floors (don’t go below these)
    const tipFloorGwei = roles.minPriorityFeeGwei ?? 2;          // 2 gwei tip by default
    const mult         = BigInt(roles.feeMultiplier ?? 2);        // cap = base*mult + tip

    // Optional roles.json “targets” — but never lower than floors/dynamic
    const tipCfg = roles.deployPriorityFeeGwei ? parseGwei(roles.deployPriorityFeeGwei) : null;
    const tip    = tipCfg ? (tipCfg > parseGwei(tipFloorGwei) ? tipCfg : parseGwei(tipFloorGwei))
                          : parseGwei(tipFloorGwei);

    const dynMax = base * mult + tip;
    const maxCfg = roles.deployMaxFeeGwei ? parseGwei(roles.deployMaxFeeGwei) : null;
    const maxF   = maxCfg && maxCfg > dynMax ? maxCfg : dynMax;

    return { tip, maxF, base };
  }

  // ---- Estimate gas + add buffer
  function withBuffer(est, pct = 20n) {
    return (est * (100n + pct)) / 100n; // e.g., +20%
  }

  // ---- Deploy helper: estimates gas, sets EIP-1559 caps, prints tx hash
  async function deployWithFees(Factory, args = [], label = "Contract") {
    const unsigned = await Factory.getDeployTransaction(...args);
    unsigned.from  = deployer.address;

    const est      = await ethers.provider.estimateGas(unsigned);
    const gasLimit = withBuffer(est, 20n);

    const { tip, maxF, base } = await resolveFeeCaps();

    const c = await Factory.deploy(...args, {
      gasLimit,
      maxPriorityFeePerGas: tip,
      maxFeePerGas: maxF,
    });

    const tx = c.deploymentTransaction();
    console.log(`${label} deploy tx:`, tx.hash, `(base≈ ${Number(ethers.formatUnits(base, "gwei")).toFixed(2)} gwei, tip= ${Number(ethers.formatUnits(tip, "gwei"))} gwei, cap= ${Number(ethers.formatUnits(maxF, "gwei"))} gwei, gasLimit= ${gasLimit})`);
    await tx.wait(1);
    const addr = await c.getAddress();
    console.log(`${label} @`, addr);
    return c;
  }

  // ---- Write helper for contract calls (applies same fees/estimation)
  async function sendWithFees(contract, method, args = [], valueWei = 0n, label = method) {
    const est = await contract.estimateGas[method](...args, valueWei ? { value: valueWei } : {});
    const gasLimit = withBuffer(est, 20n);
    const { tip, maxF, base } = await resolveFeeCaps();
    const tx = await contract[method](...args, {
      value: valueWei || undefined,
      gasLimit,
      maxPriorityFeePerGas: tip,
      maxFeePerGas: maxF,
    });
    console.log(`${label} tx:`, tx.hash, `(base≈ ${Number(ethers.formatUnits((await ethers.provider.getBlock("pending")).baseFeePerGas ?? base, "gwei")).toFixed(2)} gwei, tip= ${Number(ethers.formatUnits(tip, "gwei"))} gwei, cap= ${Number(ethers.formatUnits(maxF, "gwei"))} gwei, gasLimit= ${gasLimit})`);
    await tx.wait(1);
    return tx.hash;
  }

  // ---- Factories
  const Blue   = await ethers.getContractFactory("BlueCoin");
  const Red    = await ethers.getContractFactory("RedCoin");
  const Yellow = await ethers.getContractFactory("YellowCoin");
  const Green  = await ethers.getContractFactory("GreenCoin");
  const Orange = await ethers.getContractFactory("OrangeCoin");
  const Purple = await ethers.getContractFactory("PurpleCoin");
  const PoP    = await ethers.getContractFactory("ProofOfPaint");

  // ---- Deploy tokens (each takes `holder` as constructor arg)
  const blue   = await deployWithFees(Blue,   [holder], "BlueCoin");
  const red    = await deployWithFees(Red,    [holder], "RedCoin");
  const yellow = await deployWithFees(Yellow, [holder], "YellowCoin");
  const green  = await deployWithFees(Green,  [holder], "GreenCoin");
  const orange = await deployWithFees(Orange, [holder], "OrangeCoin");
  const purple = await deployWithFees(Purple, [holder], "PurpleCoin");

  const addrs = {
    BLUE:   await blue.getAddress(),
    RED:    await red.getAddress(),
    YELLOW: await yellow.getAddress(),
    GREEN:  await green.getAddress(),
    ORANGE: await orange.getAddress(),
    PURPLE: await purple.getAddress(),
  };
  console.log(addrs);

  // ---- Deploy ProofOfPaint (no constructor args shown; add if needed)
  const pop = await deployWithFees(PoP, [], "ProofOfPaint");
  addrs.POP = await pop.getAddress();

  // ---- Pools (use same fee logic so these writes don’t get tiny caps)
  await sendWithFees(pop, "addPairPool",   [blue.target,  yellow.target, green.target],  0n, "addPairPool#1");
  await sendWithFees(pop, "addPairPool",   [red.target,   yellow.target, orange.target], 0n, "addPairPool#2");
  await sendWithFees(pop, "addPairPool",   [blue.target,  red.target,    purple.target], 0n, "addPairPool#3");
  await sendWithFees(pop, "addSinglePool", [purple.target, red.target,   blue.target],   0n, "addSinglePool#1");
  await sendWithFees(pop, "addSinglePool", [green.target,  yellow.target, blue.target],  0n, "addSinglePool#2");
  await sendWithFees(pop, "addSinglePool", [orange.target, yellow.target, red.target],   0n, "addSinglePool#3");

  // ---- Save deployments
  try {
    fs.mkdirSync("deployments", { recursive: true });
    const { chainId, name } = await ethers.provider.getNetwork();
    const payload = { chainId: Number(chainId), network: name, timestamp: Date.now(), addresses: addrs };
    const file = `deployments/pop.${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    fs.writeFileSync("deployments/latest.pop.json", JSON.stringify(payload, null, 2));
    console.log("Saved:", file);
  } catch (e) {
    console.warn("save failed", e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
