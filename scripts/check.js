// npx hardhat run scripts/check.js --network mainnet
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(deployer.address);
  const fee = await ethers.provider.getFeeData();
  const nonceLatest  = await ethers.provider.getTransactionCount(deployer.address, "latest");
  const noncePending = await ethers.provider.getTransactionCount(deployer.address, "pending");

  console.log({
    address: deployer.address,
    chainId: Number(net.chainId),
    balanceETH: ethers.formatEther(bal),
    nonceLatest, noncePending,
    feeData: {
      gasPrice: fee.gasPrice?.toString(),
      maxFeePerGas: fee.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas?.toString()
    }
  });
}
main();
