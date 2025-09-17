// scripts/cancel_stuck.js
require("dotenv").config();
const { ethers } = require("ethers");

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    throw new Error("Missing PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in environment");
  }
  const normalizedPk = pk.startsWith("0x") ? pk : `0x${pk}`;
  const wallet = new ethers.Wallet(normalizedPk, provider);

  const latest  = await provider.getTransactionCount(wallet.address, "latest");
  const pending = await provider.getTransactionCount(wallet.address, "pending");
  console.log({ latest, pending });

  if (pending === latest) {
    console.log("No pending nonces to replace."); return;
  }

  const tip = ethers.parseUnits(process.env.CANCEL_TIP_GWEI || "3", "gwei");
  const cap = ethers.parseUnits(process.env.CANCEL_MAXFEE_GWEI || "60", "gwei");

  for (let n = latest; n < pending; n++) {
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      nonce: n,                 // replace nonce n
      gasLimit: 21000n,
      maxPriorityFeePerGas: tip,
      maxFeePerGas: cap,
    });
    console.log(`Replaced nonce ${n}:`, tx.hash);
    await tx.wait(1);
  }
  console.log("All pending nonces cleared.");
})();
