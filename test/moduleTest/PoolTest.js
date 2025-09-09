const {
  setUpTestEnvironment,
  testUtils,
  deployTestToken,
} = require("../../scripts/test-setup");
const { TickMath, encodeSqrtRatioX96 } = require("@uniswap/v3-sdk");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pool Test", () => {
  let contracts;
  let tokenA, tokenB;
  let token0, token1, token0Contract, token1Contract;
  let factory;
  let deployer, user1;
  let pool;
  let tickLower, tickUpper, fee;
  let sqrtPriceX96;
  let poolLP;

  beforeEach(async () => {
    contracts = await setUpTestEnvironment();
    factory = contracts.factory;
    deployer = contracts.deployer;
    user1 = contracts.user1;

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

    await factory.createPool(token0, token1, tickLower, tickUpper, fee);
    const poolAddress = await factory.getPool(token0, token1, 0);
    pool = await ethers.getContractAt("Pool", poolAddress);

    // 部署MockMintCallback合约
    const MockPoolLP = await ethers.getContractFactory("TestPoolLP");
    poolLP = await MockPoolLP.deploy();
    await poolLP.waitForDeployment();

    // 计算一个初始化的价格，按照 1 个 token0 换 10000 个 token1 来算，其实就是 10000
    sqrtPriceX96 = BigInt(encodeSqrtRatioX96(10000, 1));
    await pool.initialize(sqrtPriceX96);
  });

  it("pool info test", async () => {
    expect(await pool.token0()).to.equal(token0);
    expect(await pool.token1()).to.equal(token1);
    expect(await pool.tickLower()).to.equal(tickLower);
    expect(await pool.tickUpper()).to.equal(tickUpper);
    expect(await pool.fee()).to.equal(fee);
    expect(await pool.sqrtPriceX96()).to.equal(sqrtPriceX96);
  });

  it("mint and burn and collect test", async () => {
    // 准备测试数据
    const liquidityAmount = 20000000;
    const initialBalance = ethers.parseEther("1000");

    // 获取合约地址
    const poolLPAddress = await poolLP.getAddress();
    const poolAddress = await pool.getAddress();

    await token0Contract.mint(poolLPAddress, initialBalance);
    await token1Contract.mint(poolLPAddress, initialBalance);

    // mint流动性
    await poolLP.mint(
      poolLPAddress,
      liquidityAmount,
      poolAddress,
      token0,
      token1
    );

    expect(await token0Contract.balanceOf(poolAddress)).to.equal(
      initialBalance - (await token0Contract.balanceOf(poolLPAddress))
    );
    expect(await token1Contract.balanceOf(poolAddress)).to.equal(
      initialBalance - (await token1Contract.balanceOf(poolLPAddress))
    );

    // 检查position信息
    const position = await pool.positions(poolLPAddress);
    expect(position.liquidity).to.equal(liquidityAmount);

    // 继续 burn 10000000
    await poolLP.burn(10000000, poolAddress);
    expect(await pool.liquidity()).to.equal(10000000);

    // create new LP
    const testLP2 = await ethers.getContractFactory("TestPoolLP");
    pool2LP = await testLP2.deploy();
    await pool2LP.waitForDeployment();
    const pool2LPAddress = await pool2LP.getAddress();
    await token0Contract.mint(pool2LPAddress, initialBalance);
    await token1Contract.mint(pool2LPAddress, initialBalance);

    await pool2LP.mint(pool2LPAddress, 5000, poolAddress, token0, token1);
    expect(await pool.liquidity()).to.equal(10005000);

    // 判断池子里面的 token1 是否等于 LP1 和 LP2 减少的 token1 之和
    const totalToken0 =
      initialBalance -
      (await token0Contract.balanceOf(poolLPAddress)) +
      (initialBalance - (await token0Contract.balanceOf(pool2LPAddress)));
    expect(await token0Contract.balanceOf(poolAddress)).to.equal(totalToken0);

    // burn all liquidity for LP
    await poolLP.burn(10000000, poolAddress);
    expect(await pool.liquidity()).to.equal(5000);
    // 判断池子里面的 token0 是否等于 LP1 和 LP2 减少的 token0 之和，burn 只是把流动性返回给 LP，不会把 token 返回给 LP
    expect(await token0Contract.balanceOf(poolAddress)).to.equal(totalToken0);
    //collect
    await poolLP.collect(poolLPAddress, poolAddress);

    // 因为取整的原因，提取流动性之后获得的 token 可能会比之前少一点
    expect(
      Number(initialBalance) -
        Number(await token0Contract.balanceOf(poolLPAddress))
    ).to.be.lessThan(10);
    expect(
      Number(initialBalance) -
        Number(await token1Contract.balanceOf(poolLPAddress))
    ).to.be.lessThan(10);
  });

  it("swap test and fee test", async () => {
    // 准备测试数据 - 增加初始余额确保有足够的token
    const initialBalance = ethers.parseEther("100000000000");

    // 获取合约地址
    const poolLPAddress = await poolLP.getAddress();
    const poolAddress = await pool.getAddress();

    await token0Contract.mint(poolLPAddress, initialBalance);
    await token1Contract.mint(poolLPAddress, initialBalance);

    // mint 适量流动性，确保交易可以完全完成
    const liquidityDelta = ethers.parseEther("1000000000");
    await poolLP.mint(
      poolLPAddress,
      liquidityDelta,
      poolAddress,
      token0,
      token1
    );

    // 通过 TestSwap 合约交易
    const TestSwap = await ethers.getContractFactory("TestSwap");
    const testSwap = await TestSwap.deploy();
    await testSwap.waitForDeployment();
    const testSwapAddress = await testSwap.getAddress();

    // 给 testSwap 合约中打入 token0 用于交易
    const swapAmount = ethers.parseEther("100"); // 减少交易数量
    await token0Contract.mint(testSwapAddress, ethers.parseEther("110"));

    // 记录交易前的余额
    const poolToken0Before = await token0Contract.balanceOf(poolAddress);
    const poolToken1Before = await token1Contract.balanceOf(poolAddress);
    const swapToken0Before = await token0Contract.balanceOf(testSwapAddress);
    const swapToken1Before = await token1Contract.balanceOf(testSwapAddress);
    const recipientToken0Before = await token0Contract.balanceOf(poolLPAddress);
    const recipientToken1Before = await token1Contract.balanceOf(poolLPAddress);

    console.log("Before swap balances:", {
      poolToken0: poolToken0Before.toString(),
      poolToken1: poolToken1Before.toString(),
      swapToken0: swapToken0Before.toString(),
      swapToken1: swapToken1Before.toString(),
      recipientToken0: recipientToken0Before.toString(),
      recipientToken1: recipientToken1Before.toString(),
    });

    expect(swapToken0Before).to.equal(ethers.parseEther("110"));
    expect(swapToken1Before).to.equal(0);

    const minPrice = 1000; // 更宽松的价格限制
    const minSqrtPriceX96 = BigInt(encodeSqrtRatioX96(minPrice, 1).toString());

    // 执行交易：用10个token0换取token1
    const [amount0, amount1] = await testSwap.testSwap.staticCall(
      poolLPAddress, // recipient - 接收token1的地址
      swapAmount, // 精确输入100个token0
      minSqrtPriceX96, // 价格下限
      poolAddress,
      token0,
      token1
    );

    console.log("Swap result (static call):", {
      amount0: amount0.toString(),
      amount1: amount1.toString(),
    });

    // 现在执行实际的交易
    await testSwap.testSwap(
      poolLPAddress, // recipient - 接收token1的地址
      swapAmount, // 精确输入10个token0
      minSqrtPriceX96, // 价格下限
      poolAddress,
      token0,
      token1
    );

    console.log("Swap result:", {
      amount0: amount0.toString(),
      amount1: amount1.toString(),
    });

    // 验证交易结果 - 由于价格滑点等因素，实际消耗的token0可能小于指定数量
    expect(amount0).to.be.gt(0); // 消耗了一些token0
    expect(amount0).to.be.lte(swapAmount); // 但不会超过指定数量
    expect(amount1).to.be.lt(0); // 输出token1，应该是负数

    // 记录交易后的余额
    const poolToken0After = await token0Contract.balanceOf(poolAddress);
    const poolToken1After = await token1Contract.balanceOf(poolAddress);
    const swapToken0After = await token0Contract.balanceOf(testSwapAddress);
    const swapToken1After = await token1Contract.balanceOf(testSwapAddress);
    const recipientToken0After = await token0Contract.balanceOf(poolLPAddress);
    const recipientToken1After = await token1Contract.balanceOf(poolLPAddress);

    console.log("After swap balances:", {
      poolToken0: poolToken0After.toString(),
      poolToken1: poolToken1After.toString(),
      swapToken0: swapToken0After.toString(),
      swapToken1: swapToken1After.toString(),
      recipientToken0: recipientToken0After.toString(),
      recipientToken1: recipientToken1After.toString(),
    });

    // 验证余额变化
    // Pool合约应该收到100个token0
    expect(poolToken0After - poolToken0Before).to.equal(swapAmount);

    // Pool合约应该转出token1给recipient
    expect(poolToken1Before - poolToken1After).to.equal(-amount1);

    // TestSwap合约应该减少100个token0
    expect(swapToken0Before - swapToken0After).to.equal(swapAmount);

    // recipient应该收到token1 100*10000个token1
    expect(recipientToken1After - recipientToken1Before).to.equal(-amount1);

    const newPrice = BigInt(await pool.sqrtPriceX96());
    const liquidity = await pool.liquidity();
    console.log("newPrice", newPrice);
    expect(newPrice).to.be.lessThan(BigInt(encodeSqrtRatioX96(10000, 1))); // 价格下跌
    expect(liquidity).to.equal(liquidityDelta); // 流动性不变

    // 提取流动性，调用 burn 方法
    await poolLP.burn(liquidityDelta, poolAddress);
    // 查看当前 token 数量
    console.log(
      "token0Contract.balanceOf(poolLPAddress)",
      await token0Contract.balanceOf(poolLPAddress)
    );
    expect(await token0Contract.balanceOf(poolLPAddress)).to.be.lessThan(
      initialBalance
    );
    // 提取 token
    await poolLP.collect(poolLPAddress, poolAddress);
    // 判断 token 是否返回给 testLP，并且大于原来的数量，因为收到了手续费，并且有交易换入了 token0
    // 初始的 token0 是 const initBalanceValue = 100000000000n * 10n ** 18n;
    console.log(
      "token0Contract.balanceOf(poolLPAddress)",
      await token0Contract.balanceOf(poolLPAddress)
    );
    expect(await token0Contract.balanceOf(poolLPAddress)).to.be.gt(
      initialBalance
    );

    console.log("Balance changes verified successfully!");
  });
});
