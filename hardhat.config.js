require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");
const { parseUnits } = require("ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: undefined,
      maxFeePerGas: process.env.MAINNET_MAX_FEE_PER_GAS ? BigInt(process.env.MAINNET_MAX_FEE_PER_GAS) : parseUnits("40", "gwei"),
      maxPriorityFeePerGas: process.env.MAINNET_MAX_PRIORITY_FEE_PER_GAS ? BigInt(process.env.MAINNET_MAX_PRIORITY_FEE_PER_GAS) : parseUnits("2", "gwei"),
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      mainnet: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
};
