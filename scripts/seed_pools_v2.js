/* eslint-disable no-console */
const fs = require("fs");
const { ethers } = require("hardhat");

// Uniswap V2 ABIs
const ERC20 = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const ROUTER_ABI = [
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)"
];
const FACTORY_ABI = [
  "function factory() view returns (address)"
];
const UNI_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

function pct(x, bps) { return (x * BigInt(10000 - bps)) / 10000n; }

async function fees() {
  const blk  = await ethers.provider.getBlock("pending");
  const base = blk?.baseFeePerGas ?? ethers.parseUnits("5","gwei");
  const tip  = ethers.parseUnits(process.env.PRIORITY_GWEI || "2","gwei");
  const maxF = base * BigInt(process.env.FEE_MULT || 2) + tip;
  return { base, tip, maxF };
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync("config/pools.json", "utf8"));

  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 1) throw new Error("Use --network mainnet");
  const [me] = await ethers.getSigners();
  console.log("Seeding from:", me.address);

  const router = new ethers.Contract(cfg.router, ROUTER_ABI.concat(FACTORY_ABI), me);
  const { base, tip, maxF } = await fees();
  console.log(`Fee plan: base≈${Number(ethers.formatUnits(base, "gwei")).toFixed(2)} gwei, tip=${Number(ethers.formatUnits(tip, "gwei"))} gwei`);

  // Resolve factory to print pair addresses later
  let factoryAddr = null;
  try { factoryAddr = await router.factory(); } catch {
    // fallback: canonical Uniswap V2 Factory
    factoryAddr = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  }
  const factory = new ethers.Contract(factoryAddr, UNI_FACTORY_ABI, ethers.provider);

  const outputs = [];

  for (const entry of cfg.tokens) {
    const { label, address: tokenAddr, price_eth_per_token, eth_deposit, use_lp_fraction } = entry;
    if (!ethers.isAddress(tokenAddr)) {
      console.error(`❌ ${label}: invalid token address ${tokenAddr}`); continue;
    }

    const t = new ethers.Contract(tokenAddr, ERC20, me);
    const [sym, dec, balRaw] = await Promise.all([
      t.symbol().catch(() => label),
      t.decimals().catch(() => 18),
      t.balanceOf(me.address)
    ]);

    // Decide how many tokens & ETH to supply
    let amountETH, amountTokenDesired;
    if (eth_deposit) {
      amountETH = ethers.parseEther(String(eth_deposit));
      const price = Number(price_eth_per_token); // ETH per 1 token
      if (!(price > 0)) { console.error(`❌ ${label}: bad price`); continue; }
      const tokensHuman = Number(eth_deposit) / price;
      amountTokenDesired = ethers.parseUnits(tokensHuman.toString(), dec);
    } else if (use_lp_fraction) {
      const frac = Number(use_lp_fraction);
      if (!(frac > 0 && frac <= 1)) { console.error(`❌ ${label}: bad use_lp_fraction`); continue; }
      amountTokenDesired = (balRaw * BigInt(Math.floor(frac * 1e6))) / 1000000n;
      const price = Number(price_eth_per_token);
      const tokensHuman = Number(ethers.formatUnits(amountTokenDesired, dec));
      amountETH = ethers.parseEther((tokensHuman * price).toString());
    } else {
      console.error(`❌ ${label}: set either eth_deposit or use_lp_fraction`); continue;
    }

    if (amountTokenDesired === 0n || amountETH === 0n) {
      console.error(`❌ ${label}: zero amounts`); continue;
    }
    if (balRaw < amountTokenDesired) {
      console.error(`❌ ${label}: not enough token balance. Have ${ethers.formatUnits(balRaw, dec)}, need ${ethers.formatUnits(amountTokenDesired, dec)}`);
      continue;
    }

    // Approve router
    const allowance = 0n; // we won't check; just approve exact amount
    console.log(`\n=== ${label} (${sym}) ===`);
    console.log(`Supplying: ${Number(ethers.formatUnits(amountTokenDesired, dec)).toLocaleString()} ${sym} + ${Number(ethers.formatEther(amountETH)).toLocaleString()} ETH`);
    const approveTx = await t.approve(cfg.router, amountTokenDesired, { maxPriorityFeePerGas: tip, maxFeePerGas: maxF });
    console.log("approve tx:", approveTx.hash);
    await approveTx.wait(1);

    // Slippage mins
    const tokenMin = pct(amountTokenDesired, cfg.slippage_bps || 300);
    const ethMin   = pct(amountETH,        cfg.slippage_bps || 300);
    const deadline = Math.floor(Date.now() / 1000) + (cfg.deadline_mins || 20) * 60;

    // addLiquidityETH
    const addTx = await router.addLiquidityETH(
      tokenAddr,
      amountTokenDesired,
      tokenMin,
      ethMin,
      me.address,           // receives LP tokens; we may forward them below
      deadline,
      {
        value: amountETH,
        maxPriorityFeePerGas: tip,
        maxFeePerGas: maxF
      }
    );
    console.log("addLiquidityETH tx:", addTx.hash);
    const rc = await addTx.wait(1);

    // Pair address
    const pair = await factory.getPair(tokenAddr, cfg.weth);
    console.log("Pair (LP) address:", pair);
    outputs.push({ label, token: tokenAddr, pair });

    // Optionally move LP tokens to recipient (Safe)
    if (cfg.lp_recipient && ethers.isAddress(cfg.lp_recipient)) {
      const LP_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address,uint256) returns (bool)",
        "function symbol() view returns (string)"
      ];
      const lp = new ethers.Contract(pair, LP_ABI, me);
      const lpBal = await lp.balanceOf(me.address);
      if (lpBal > 0n) {
        const moveTx = await lp.transfer(cfg.lp_recipient, lpBal, { maxPriorityFeePerGas: tip, maxFeePerGas: maxF });
        console.log(`moved LP → ${cfg.lp_recipient}:`, moveTx.hash);
        await moveTx.wait(1);
      } else {
        console.log("no LP balance to move (check after more confirmations)");
      }
    } else {
      console.log("LP stays in sender (set lp_recipient in config to auto-move).");
    }
  }

  console.log("\nSummary:");
  for (const o of outputs) console.log(`${o.label}: Pair ${o.pair}`);
}

main().catch(e => { console.error(e); process.exit(1); });
