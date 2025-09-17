/* eslint-disable no-console */
const { ethers } = require("hardhat");

const ERC20 = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)"
];
const ROUTER_ABI = [
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint,uint,uint)"
];

function pct(x, bps) { return (x * BigInt(10000 - bps)) / 10000n; }

async function main() {
  // >>> fill these 3 lines <<<
  const TOKEN   = "0x6Af7d8eea65942fb982d2EB0D94AFae5d03891DD"; // PURPLE
  const PRICE   = 0.000000009375000009000;         // ETH per 1 PURPLE (example)
  const ETH_DEP = "0.05";        // ETH you want to supply

  const ROUTER  = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  const WETH    = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const SLIP_BPS = 300;
  const DEADLINE_MINS = 20;
  const LP_RECIPIENT = "0x3862366cee2aCbF4017c2DA6A337Cd12EF1fDFCB"; // same Safe

  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 1) throw new Error("use --network mainnet");
  const [me] = await ethers.getSigners();

  const blk  = await ethers.provider.getBlock("pending");
  const base = blk?.baseFeePerGas ?? ethers.parseUnits("5","gwei");
  const tip  = ethers.parseUnits("2","gwei");
  const maxF = base * 2n + tip;

  const token = new ethers.Contract(TOKEN, ERC20, me);
  const [sym, dec] = await Promise.all([token.symbol().catch(()=>"?"), token.decimals().catch(()=>18)]);

  const amountETH  = ethers.parseEther(ETH_DEP);
  const tokenHuman = Number(ETH_DEP) / Number(PRICE);
  const amountTok  = ethers.parseUnits(tokenHuman.toString(), dec);

  console.log(`Supplying: ${tokenHuman.toLocaleString()} ${sym} + ${ETH_DEP} ETH`);

  await (await token.approve(ROUTER, amountTok, { maxPriorityFeePerGas: tip, maxFeePerGas: maxF })).wait(1);

  const tokenMin = pct(amountTok, SLIP_BPS);
  const ethMin   = pct(amountETH, SLIP_BPS);
  const deadline = Math.floor(Date.now()/1000) + DEADLINE_MINS*60;

  const router = new ethers.Contract(ROUTER, ROUTER_ABI, me);
  const tx = await router.addLiquidityETH(
    TOKEN, amountTok, tokenMin, ethMin, me.address, deadline,
    { value: amountETH, maxPriorityFeePerGas: tip, maxFeePerGas: maxF }
  );
  console.log("addLiquidity tx:", tx.hash);
  const rc = await tx.wait(1);

  // Find pair & move LP
  const FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UF_ABI = ["function getPair(address,address) view returns (address)"];
  const factory = new ethers.Contract(FACTORY, UF_ABI, ethers.provider);
  const pair = await factory.getPair(TOKEN, WETH);
  console.log("Pair:", pair);

  const LP_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)"
  ];
  const lp = new ethers.Contract(pair, LP_ABI, me);
  const bal = await lp.balanceOf(me.address);
  if (bal > 0n) {
    const move = await lp.transfer(LP_RECIPIENT, bal, { maxPriorityFeePerGas: tip, maxFeePerGas: maxF });
    console.log("moved LP tx:", move.hash);
    await move.wait(1);
  } else {
    console.log("no LP to move (check later and sweep)");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
