const {
  setUpTestEnvironment,
  testUtils,
  deployTestToken,
} = require("../../scripts/test-setup");
const { encodeSqrtRatioX96 } = require("@uniswap/v3-sdk");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PositionManager", () => {
  let contracts;
  let tokenA, tokenB;
  let token0, token1, token0Contract, token1Contract;
  let factory;
  let deployer, user1;
  let pool;
  let tickLower, tickUpper, fee, sqrtPriceX96;
  let poolLP;
  let positionManager;

  beforeEach(async () => {
    contracts = await setUpTestEnvironment();
    factory = contracts.factory;
    deployer = contracts.deployer;
    user1 = contracts.user1;
    positionManager = contracts.positionManager;

    // 创建测试代币对
    const tokenPair = await testUtils.createTokenPair(deployTestToken);
    tokenA = tokenPair.tokenA;
    tokenB = tokenPair.tokenB;

    [token0, token1] = testUtils.sortTokens(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );

    token0Contract = await ethers.getContractAt("TestERC20", token0);
    token1Contract = await ethers.getContractAt("TestERC20", token1);

    tickLower = testUtils.constants.TICK_LOWER;
    tickUpper = testUtils.constants.TICK_UPPER;
    fee = testUtils.constants.FEE_TIER_MEDIUM;

    // 使用 poolManager 而不是 factory 来创建和获取pool
    //由于 PositionManager 使用的是 poolManager，所以测试中也应该使用 poolManager 来创建pool。
    await contracts.poolManager.createPool(
      token0,
      token1,
      tickLower,
      tickUpper,
      fee
    );
    const poolAddress = await contracts.poolManager.getPool(token0, token1, 0);
    pool = await ethers.getContractAt("Pool", poolAddress);

    // 部署MockMintCallback合约
    const MockPoolLP = await ethers.getContractFactory("TestPoolLP");
    poolLP = await MockPoolLP.deploy();
    await poolLP.waitForDeployment();

    // 计算一个初始化的价格，按照 1 个 token0 换 10000 个 token1 来算，其实就是 10000
    sqrtPriceX96 = BigInt(encodeSqrtRatioX96(10000, 1));
    await pool.initialize(sqrtPriceX96);
  });

  it("mint  && burn && collect test", async () => {
    // 先给 sender 打钱
    const initialBalance = ethers.parseEther("1000");
    await token0Contract.mint(user1.address, initialBalance);
    await token1Contract.mint(user1.address, initialBalance);

    // sender approve manager
    await token0Contract.approve(positionManager.getAddress(), initialBalance);
    await token1Contract.approve(positionManager.getAddress(), initialBalance);

    // mint
    await positionManager.mint({
      token0: token0,
      token1: token1,
      index: 0,
      amount0Desired: initialBalance,
      amount1Desired: initialBalance,
      recipient: user1.address,
      deadline: BigInt(Date.now() + 3000),
    });

    // mint 成功，检查余额
    const user1BalanceBefore = await token0Contract.balanceOf(user1.address);
    console.log("token0Contract.balanceOf(user1.address)", user1BalanceBefore);

    expect(await positionManager.connect(user1).ownerOf(1)).to.equal(
      user1.address
    );

    // 检查 position 信息
    // burn
    await positionManager.connect(user1).burn(1);
    // collet
    await positionManager.connect(user1).collect(1, user1.address);

    // 检查余额
    expect(await token0Contract.balanceOf(user1.address)).to.be.greaterThan(
      user1BalanceBefore //加上了手续费
    );
  });
  it("collect with fee test", async () => {
    // 先给 sender 打钱
    const initialBalance = ethers.parseEther("100000000000");
    await token0Contract.mint(user1.address, initialBalance);
    await token1Contract.mint(user1.address, initialBalance);

    // sender approve manager
    await token0Contract.approve(positionManager.getAddress(), initialBalance);
    await token1Contract.approve(positionManager.getAddress(), initialBalance);
    // mint 多一些流动性，确保交易可以完全完成
    await positionManager.mint({
      token0: token0,
      token1: token1,
      index: 0,
      amount0Desired: initialBalance - ethers.parseEther("1000"),
      amount1Desired: initialBalance - ethers.parseEther("1000"),
      recipient: user1.address,
      deadline: BigInt(Date.now() + 3000),
    });

    // mint anthor 1000
    await positionManager.mint({
      token0: token0,
      token1: token1,
      index: 0,
      amount0Desired: ethers.parseEther("1000"),
      amount1Desired: ethers.parseEther("1000"),
      recipient: user1.address,
      deadline: BigInt(Date.now() + 3000),
    });

    // 通过 TestSwap 合约交易
    const TestSwap = await ethers.getContractFactory("TestSwap");
    const testSwap = await TestSwap.deploy();
    await testSwap.waitForDeployment();
    const testSwapAddress = await testSwap.getAddress();

    const minPrice = 1000;
    const minSqrtPriceX96 = BigInt(encodeSqrtRatioX96(minPrice, 1).toString());
    // 给 testSwap 合约中打入 token0 用于交易
    await token0Contract.mint(testSwapAddress, ethers.parseEther("300"));

    await testSwap.testSwap(
      testSwapAddress,
      ethers.parseEther("100"),
      minSqrtPriceX96,
      pool.getAddress(),
      token0,
      token1
    );

    // 提取流动性，调用 burn 方法
    await positionManager.connect(user1).burn(1);
    await positionManager.connect(user1).burn(2);

    // burn后，代币还在pool中，用户余额应该很少（因为大部分代币都提供了流动性）
    const balanceAfterBurn = await token0Contract.balanceOf(user1.address);
    console.log("Balance after burn:", balanceAfterBurn.toString());

    // 提取 token
    await positionManager.connect(user1).collect(1, user1.address);
    const balanceAfterCollect1 = await token0Contract.balanceOf(user1.address);
    console.log("Balance after collect 1:", balanceAfterCollect1.toString());

    // 第一次collect后，余额应该比burn后增加（因为取回了流动性和可能的手续费）
    expect(balanceAfterCollect1).to.be.greaterThan(balanceAfterBurn);

    await positionManager.connect(user1).collect(2, user1.address);
    const balanceAfterCollect2 = await token0Contract.balanceOf(user1.address);
    console.log("Balance after collect 2:", balanceAfterCollect2.toString());

    // 第二次collect后，余额应该进一步增加
    expect(balanceAfterCollect2).to.be.greaterThan(balanceAfterCollect1);

    // 最终余额应该接近或大于初始余额（因为有手续费收入）
    expect(balanceAfterCollect2).to.be.greaterThanOrEqual(initialBalance);
  });
});
