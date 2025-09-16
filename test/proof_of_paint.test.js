const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;

async function advanceTo(daysFromStart, startTimestamp) {
  const target = startTimestamp + daysFromStart * DAY + 1;
  await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
  await ethers.provider.send("evm_mine", []);
}

async function advanceByDays(days) {
  await ethers.provider.send("evm_increaseTime", [days * DAY]);
  await ethers.provider.send("evm_mine", []);
}

describe("ProofOfPaint staking", function () {
  async function deployFixture() {
    const [deployer, user, operator] = await ethers.getSigners();

    const Blue = await ethers.getContractFactory("BlueCoin");
    const Red = await ethers.getContractFactory("RedCoin");
    const Yellow = await ethers.getContractFactory("YellowCoin");
    const Green = await ethers.getContractFactory("GreenCoin");
    const Orange = await ethers.getContractFactory("OrangeCoin");
    const Purple = await ethers.getContractFactory("PurpleCoin");
    const blue = await Blue.deploy(deployer.address); await blue.waitForDeployment();
    const red = await Red.deploy(deployer.address); await red.waitForDeployment();
    const yellow = await Yellow.deploy(deployer.address); await yellow.waitForDeployment();
    const green = await Green.deploy(deployer.address); await green.waitForDeployment();
    const orange = await Orange.deploy(deployer.address); await orange.waitForDeployment();
    const purple = await Purple.deploy(deployer.address); await purple.waitForDeployment();

    const PoP = await ethers.getContractFactory("ProofOfPaint");
    const pop = await PoP.deploy();
    await pop.waitForDeployment();

    await (await pop.addPairPool(blue.target, yellow.target, green.target)).wait();
    await (await pop.addPairPool(red.target, yellow.target, orange.target)).wait();
    await (await pop.addPairPool(blue.target, red.target, purple.target)).wait();
    await (await pop.addSinglePool(purple.target, red.target, blue.target)).wait();
    await (await pop.addSinglePool(green.target, yellow.target, blue.target)).wait();
    await (await pop.addSinglePool(orange.target, yellow.target, red.target)).wait();

    return {
      deployer,
      user,
      operator,
      pop,
      tokens: { blue, red, yellow, green, orange, purple },
    };
  }

  it("pays exponential partial reward before day 90 and full reward at day 90", async function () {
    const { deployer, user, pop, tokens } = await deployFixture();
    const { blue, yellow, green } = tokens;

    const stakeAmt = ethers.parseEther("100");
    const rewardBudget = ethers.parseEther("1000");

    await (await green.approve(await pop.getAddress(), rewardBudget)).wait();
    await (await pop.fundReward(0, green.target, rewardBudget)).wait();

    await (await blue.transfer(user.address, stakeAmt * 3n)).wait();
    await (await yellow.transfer(user.address, stakeAmt * 3n)).wait();

    await (await blue.connect(user).approve(await pop.getAddress(), stakeAmt * 3n)).wait();
    await (await yellow.connect(user).approve(await pop.getAddress(), stakeAmt * 3n)).wait();

    // Stake once and claim halfway
    await (await pop.connect(user).stakePair(0, stakeAmt)).wait();
    const startTs = (await ethers.provider.getBlock("latest")).timestamp;
    await advanceTo(45, startTs);
    const factorMid = await pop.rewardCurve(45);
    const expectedMid = (stakeAmt * factorMid) / 1_000_000n;
    const balanceBeforeMid = await green.balanceOf(user.address);
    await (await pop.connect(user).claim(0)).wait();
    const balanceAfterMid = await green.balanceOf(user.address);
    expect(balanceAfterMid - balanceBeforeMid).to.equal(expectedMid);

    // Stake again and wait full 90 days
    await (await pop.connect(user).stakePair(0, stakeAmt)).wait();
    const startTs2 = (await ethers.provider.getBlock("latest")).timestamp;
    await advanceTo(91, startTs2);
    const beforeFull = await green.balanceOf(user.address);
    await (await pop.connect(user).claim(0)).wait();
    const afterFull = await green.balanceOf(user.address);
    expect(afterFull - beforeFull).to.equal(stakeAmt);
  });

  it("allows early withdraw with no burn or reward", async function () {
    const { user, pop, tokens } = await deployFixture();
    const { blue, yellow } = tokens;

    const stakeAmt = ethers.parseEther("10");
    await (await blue.transfer(user.address, stakeAmt)).wait();
    await (await yellow.transfer(user.address, stakeAmt)).wait();
    await (await blue.connect(user).approve(await pop.getAddress(), stakeAmt)).wait();
    await (await yellow.connect(user).approve(await pop.getAddress(), stakeAmt)).wait();

    await (await pop.connect(user).stakePair(0, stakeAmt)).wait();
    await advanceByDays(30);

    const blueBefore = await blue.balanceOf(user.address);
    const yellowBefore = await yellow.balanceOf(user.address);
    await (await pop.connect(user).earlyWithdraw(0)).wait();
    const blueAfter = await blue.balanceOf(user.address);
    const yellowAfter = await yellow.balanceOf(user.address);
    expect(blueAfter - blueBefore).to.equal(stakeAmt);
    expect(yellowAfter - yellowBefore).to.equal(stakeAmt);
  });

  it("pays dual rewards for single-token pools", async function () {
    const { deployer, user, pop, tokens } = await deployFixture();
    const { purple, red, blue } = tokens;

    const stakeAmt = ethers.parseEther("50");
    const rewardBudget = ethers.parseEther("1000");

    await (await red.approve(await pop.getAddress(), rewardBudget)).wait();
    await (await blue.approve(await pop.getAddress(), rewardBudget)).wait();
    await (await pop.fundReward(3, red.target, rewardBudget)).wait();
    await (await pop.fundReward(3, blue.target, rewardBudget)).wait();

    await (await purple.transfer(user.address, stakeAmt)).wait();
    await (await purple.connect(user).approve(await pop.getAddress(), stakeAmt)).wait();

    await (await pop.connect(user).stakeSingle(3, stakeAmt)).wait();
    await advanceByDays(90);

    const redBefore = await red.balanceOf(user.address);
    const blueBefore = await blue.balanceOf(user.address);
    await (await pop.connect(user).claim(3)).wait();
    const redAfter = await red.balanceOf(user.address);
    const blueAfter = await blue.balanceOf(user.address);
    expect(redAfter - redBefore).to.equal(stakeAmt);
    expect(blueAfter - blueBefore).to.equal(stakeAmt);
  });
});
