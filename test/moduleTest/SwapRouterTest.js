const {
  setUpTestEnvironment,
  testUtils,
  deployTestToken,
} = require("../../scripts/test-setup");
const { encodeSqrtRatioX96, TickMath } = require("@uniswap/v3-sdk");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PositionManager", () => {
  let contracts;
  let tokenA, tokenB;
  let token0, token1, token0Contract, token1Contract;
  let factory;
  let deployer, user1;
  let pool;
  let tickLower, tickUpper, fee_L1, fee_L2, sqrtPriceX96;
  let poolLP;
  let poolManager;
  let swapRouter;

  beforeEach(async () => {
    contracts = await setUpTestEnvironment();
    factory = contracts.factory;
    deployer = contracts.deployer;
    user1 = contracts.user1;
    poolManager = contracts.poolManager;
    swapRouter = contracts.swapRouter;

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
    sqrtPriceX96 = BigInt(encodeSqrtRatioX96(10000, 1).toString());
    fee_L2 = testUtils.constants.FEE_TIER_MEDIUM;
    fee_L1 = testUtils.constants.FEE_TIER_HIGH;

    await poolManager.createAndInitializePoolIfNecessary({
      token0: token0,
      token1: token1,
      tickLower: tickLower,
      tickUpper: tickUpper,
      fee: fee_L2,
      sqrtPriceX96: sqrtPriceX96,
    });

    await poolManager.createAndInitializePoolIfNecessary({
      token0: token0,
      token1: token1,
      tickLower: tickLower,
      tickUpper: tickUpper,
      fee: fee_L1,
      sqrtPriceX96: sqrtPriceX96,
    });
    // 注入流动性
    // 部署一个 LP 测试合约
    const MockPoolLP = await ethers.getContractFactory("TestPoolLP");
    poolLP = await MockPoolLP.deploy();
    await poolLP.waitForDeployment();
    const initialBalance = ethers.parseEther("1000000000000");

    await token0Contract.mint(poolLP.getAddress(), initialBalance);
    await token1Contract.mint(poolLP.getAddress(), initialBalance);

    // 给池子1注入流动性
    // 获取池子1的地址
    const pool1Address = await poolManager.getPool(token0, token1, 0);
    await token0Contract.approve(pool1Address, initialBalance);
    await token1Contract.approve(pool1Address, initialBalance);
    await poolLP.mint(
      pool1Address,
      ethers.parseEther("50000"),
      pool1Address,
      token0,
      token1
    );

    // 给池子2注入流动性
    const pool2Address = await poolManager.getPool(token0, token1, 1);
    await token0Contract.approve(pool2Address, initialBalance);
    await token1Contract.approve(pool2Address, initialBalance);
    await poolLP.mint(
      pool2Address,
      ethers.parseEther("50000"),
      pool2Address,
      token0,
      token1
    );
  });
  it("exactInput test", async () => {
    await token0Contract.mint(
      user1.address,
      ethers.parseEther("1000000000000")
    );
    await token0Contract.approve(
      swapRouter.getAddress(),
      ethers.parseEther("100")
    );
    await swapRouter.exactInput({
      tokenIn: token0,
      tokenOut: token1,
      amountIn: ethers.parseEther("10"),
      amountOutMinimum: ethers.parseEther("0"),
      indexPath: [0, 1],
      sqrtPriceLimitX96: BigInt(encodeSqrtRatioX96(100, 1).toString()),
      recipient: user1.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1000),
    });

    const token1Amount = await token1Contract.balanceOf(user1.address);
    expect(token1Amount).to.be.greaterThan(ethers.parseEther("90000"));
    console.log("Received token1 amount:", ethers.formatEther(token1Amount));
    // 10个token0 应该换到了100000 token1// 大概是 97760 * 10 ** 18，按照 10000 的价格
  });

  it("exactOutput test", async () => {
    // exactOutput: 用token1换取指定数量的token0
    // 所以需要给用户铸造token1并批准
    await token1Contract.mint(
      user1.address,
      ethers.parseEther("1000000000000")
    );
    await token1Contract
      .connect(user1)
      .approve(swapRouter.getAddress(), ethers.parseEther("15000")); // 需要足够的token1
    await swapRouter.connect(user1).exactOutput({
      tokenIn: token1,
      tokenOut: token0,
      amountOut: ethers.parseEther("1"), // 想要获得1个token0
      amountInMaximum: ethers.parseEther("15000"), // 最多支付15000个token1
      indexPath: [0, 1],
      sqrtPriceLimitX96: BigInt(encodeSqrtRatioX96(20000, 1).toString()), // 价格限制必须高于当前价格10000:1
      recipient: user1.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1000),
    });

    // 检查收到的 token0 数量（应该接近1个）
    const token0Amount = await token0Contract.balanceOf(user1.address);
    expect(token0Amount).to.be.greaterThan(ethers.parseEther("0.9")); // 至少收到0.9个token0
    console.log("Received token0 amount:", ethers.formatEther(token0Amount));

    // 检查剩余的 token1 数量（应该减少了大约10000个token1）
    const token1Amount = await token1Contract.balanceOf(user1.address);
    const initialToken1 = ethers.parseEther("1000000000000");
    expect(token1Amount).to.be.lessThan(initialToken1); // token1应该减少了
    console.log("Remaining token1 amount:", ethers.formatEther(token1Amount));
    console.log(
      "Spent token1 amount:",
      ethers.formatEther(initialToken1 - token1Amount)
    );
  });

  it("quoteExactInput test", async () => {
    const data = await swapRouter.quoteExactInput({
      tokenIn: token0,
      tokenOut: token1,
      amountIn: ethers.parseEther("10"), // 输入 token0 的数量
      indexPath: [0, 1], // 单池 quote
      sqrtPriceLimitX96: BigInt(encodeSqrtRatioX96(100, 1).toString()),
    });

    console.log("Quote result:", data);
    // 10 个 token0 按照 10000 的价格大概可以换到接近 100000 个 token1
    // 但考虑到滑点和手续费，实际数量会少一些
    expect(data).to.be.greaterThan(ethers.parseEther("90000")); // 至少 90000 个 token1
  });

  it("quoteExactOutput test", async function () {
    const data = await swapRouter.quoteExactOutput({
      tokenIn: token0,
      tokenOut: token1,
      amountOut: ethers.parseEther("10000"), // 想要得到 10000 个 token1
      indexPath: [0, 1], // 单池 quote
      sqrtPriceLimitX96: BigInt(encodeSqrtRatioX96(100, 1).toString()), // 价格限制要高于当前价格10000:1
    });

    // 要获得 10000 个 token1，按照 10000:1 的价格，大概需要 1 个 token0
    // 但考虑到滑点和手续费，实际需要的会多一些
    expect(data).to.be.greaterThan(ethers.parseEther("0.9")); // 至少需要 0.9 个 token0
    expect(data).to.be.lessThan(ethers.parseEther("1")); // 但不应该超过 1 个 token0
  });
});
