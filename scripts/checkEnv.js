const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function mask(s) { return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : ""; }

function isHexPrivateKey(pk) {
  return typeof pk === "string" && pk.startsWith("0x") && pk.length === 66 && /^[0-9a-fA-Fx]+$/.test(pk);
}

function isUrl(u) {
  return typeof u === "string" && /^(http|https):\/\//.test(u);
}

async function main() {
  const issues = [];
  const env = process.env;
  const out = {};

  // RPC URLs
  if (!isUrl(env.SEPOLIA_RPC_URL)) issues.push("SEPOLIA_RPC_URL missing or not a URL");
  if (env.MAINNET_RPC_URL && !isUrl(env.MAINNET_RPC_URL)) issues.push("MAINNET_RPC_URL set but not a URL");

  // Private key
  if (!isHexPrivateKey(env.DEPLOYER_PRIVATE_KEY)) issues.push("DEPLOYER_PRIVATE_KEY missing or not 0x-prefixed 32-byte hex");

  // Etherscan key optional, just note
  if (!env.ETHERSCAN_API_KEY) out.etherscan = "ETHERSCAN_API_KEY not set (verification optional)";

  // Derive deployer address (no secret printed)
  try {
    const { Wallet } = require("ethers");
    if (isHexPrivateKey(env.DEPLOYER_PRIVATE_KEY)) {
      const wallet = new Wallet(env.DEPLOYER_PRIVATE_KEY);
      out.deployerAddress = wallet.address;
    }
  } catch (e) {
    issues.push("Unable to derive deployer address from DEPLOYER_PRIVATE_KEY");
  }

  // Compare with roles.json if present
  const rolesPath = path.resolve(process.cwd(), "config/roles.json");
  if (fs.existsSync(rolesPath)) {
    try {
      const roles = JSON.parse(fs.readFileSync(rolesPath, "utf8"));
      out.roles = {
        owner: roles.owner,
        operator: roles.operator,
        pauser: roles.pauser,
        tokenOwner: roles.tokenOwner,
        tokensOwner: roles.tokensOwner,
      };
      if (out.deployerAddress && roles.owner && roles.owner.toLowerCase() !== out.deployerAddress.toLowerCase()) {
        issues.push(`Owner in roles.json (${roles.owner}) differs from deployer address (${out.deployerAddress})`);
      }
    } catch (e) {
      issues.push("Failed to read/parse config/roles.json");
    }
  } else {
    out.roles = "config/roles.json not found";
  }

  const result = { ok: issues.length === 0, issues, info: out, present: {
    SEPOLIA_RPC_URL: !!env.SEPOLIA_RPC_URL,
    MAINNET_RPC_URL: !!env.MAINNET_RPC_URL,
    DEPLOYER_PRIVATE_KEY: !!env.DEPLOYER_PRIVATE_KEY ? `set (${mask(env.DEPLOYER_PRIVATE_KEY)})` : false,
    ETHERSCAN_API_KEY: !!env.ETHERSCAN_API_KEY,
  }};
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

