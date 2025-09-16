const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Read roles config if present to choose token holder/owner
  let roles = {};
  if (fs.existsSync("config/roles.json")) roles = JSON.parse(fs.readFileSync("config/roles.json", "utf8"));
  const holder = roles.tokenOwner || deployer.address;

  // Deploy tokens
  const deployGasOverrides = () => {
    const gasCfg = roles.deployGasLimit;
    if (!gasCfg) return {};
    return { gasLimit: BigInt(gasCfg) };
  };

  const tokenOverrides = () => {
    if (roles.deployGasLimitToken) return { gasLimit: BigInt(roles.deployGasLimitToken) };
    return deployGasOverrides();
  };

  const popOverrides = () => {
    if (roles.deployGasLimitPop) return { gasLimit: BigInt(roles.deployGasLimitPop) };
    return deployGasOverrides();
  };

  const Blue = await ethers.getContractFactory("BlueCoin");
  const Red = await ethers.getContractFactory("RedCoin");
  const Yellow = await ethers.getContractFactory("YellowCoin");
  const Green = await ethers.getContractFactory("GreenCoin");
  const Orange = await ethers.getContractFactory("OrangeCoin");
  const Purple = await ethers.getContractFactory("PurpleCoin");
  const blue = await Blue.deploy(holder, tokenOverrides()); await blue.waitForDeployment();
  const red = await Red.deploy(holder, tokenOverrides()); await red.waitForDeployment();
  const yellow = await Yellow.deploy(holder, tokenOverrides()); await yellow.waitForDeployment();
  const green = await Green.deploy(holder, tokenOverrides()); await green.waitForDeployment();
  const orange = await Orange.deploy(holder, tokenOverrides()); await orange.waitForDeployment();
  const purple = await Purple.deploy(holder, tokenOverrides()); await purple.waitForDeployment();

  const addrs = {
    BLUE: await blue.getAddress(),
    RED: await red.getAddress(),
    YELLOW: await yellow.getAddress(),
    GREEN: await green.getAddress(),
    ORANGE: await orange.getAddress(),
    PURPLE: await purple.getAddress(),
  };
  console.log(addrs);

  // Deploy ProofOfPaint
  const PoP = await ethers.getContractFactory("ProofOfPaint");
  const pop = await PoP.deploy(popOverrides());
  await pop.waitForDeployment();
  addrs.POP = await pop.getAddress();
  console.log("ProofOfPaint:", addrs.POP);

  // Add pools (pairs then singles)
  await (await pop.addPairPool(blue.target, yellow.target, green.target)).wait();
  await (await pop.addPairPool(red.target, yellow.target, orange.target)).wait();
  await (await pop.addPairPool(blue.target, red.target, purple.target)).wait();
  await (await pop.addSinglePool(purple.target, red.target, blue.target)).wait();
  await (await pop.addSinglePool(green.target, yellow.target, blue.target)).wait();
  await (await pop.addSinglePool(orange.target, yellow.target, red.target)).wait();

  // Save deployments
  try {
    fs.mkdirSync("deployments", { recursive: true });
    const { chainId, name } = await ethers.provider.getNetwork();
    const payload = { chainId: Number(chainId), network: name, timestamp: Date.now(), addresses: addrs };
    const file = `deployments/pop.${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    fs.writeFileSync("deployments/latest.pop.json", JSON.stringify(payload, null, 2));
    console.log("Saved:", file);
  } catch (e) { console.warn("save failed", e.message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
