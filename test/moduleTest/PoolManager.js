const { setUpTestEnvironment, testUtils } = require("../../scripts/test-setup");
const { expect } = require("chai");
const { TickMath, encodeSqrtRatioX96 } = require("@uniswap/v3-sdk");

describe("PoolManager Test", async () => {
  let contracts;
  let tokenA, tokenB, tokenC, tokenD;
  let token0, token1, token2, token3;
  let poolManager;
  let deployer, user1;

  beforeEach(async () => {
    contracts = await setUpTestEnvironment();
    poolManager = contracts.poolManager;
    deployer = contracts.deployer;
    user1 = contracts.user1;

    // 创建测试代币对
    const tokenPair = await testUtils.createTokenPair(
      contracts.deployTestToken
    );
    tokenA = tokenPair.tokenA;
    tokenB = tokenPair.tokenB;

    const tokenPair2 = await testUtils.createTokenPair(
      contracts.deployTestToken
    );
    tokenC = tokenPair2.tokenA;
    tokenD = tokenPair2.tokenB;

    [token0, token1] = testUtils.sortTokens(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );

    [token2, token3] = testUtils.sortTokens(
      await tokenC.getAddress(),
      await tokenD.getAddress()
    );
  });

  it("getPairs && getAllPools", async () => {
    await poolManager.createAndInitializePoolIfNecessary({
      token0: token0,
      token1: token1,
      fee: 3000,
      tickLower: testUtils.constants.TICK_LOWER,
      tickUpper: testUtils.constants.TICK_UPPER,
      sqrtPriceX96: BigInt(encodeSqrtRatioX96(100, 1).toString()),
    });
    // 由于和前一个参数一样，会被合并
    await poolManager.createAndInitializePoolIfNecessary({
      token0: token0,
      token1: token1,
      fee: 3000,
      tickLower: testUtils.constants.TICK_LOWER,
      tickUpper: testUtils.constants.TICK_UPPER,
      sqrtPriceX96: BigInt(encodeSqrtRatioX96(100, 1).toString()),
    });

    await poolManager.createAndInitializePoolIfNecessary({
      token0: token2,
      token1: token3,
      fee: 2000,
      tickLower: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(100, 1)),
      tickUpper: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(5000, 1)),
      sqrtPriceX96: BigInt(encodeSqrtRatioX96(200, 1).toString()),
    });
    // 判断返回的 pairs 的数量是否正确
    const pairs = await poolManager.getPairs();
    expect(pairs.length).to.equal(2);

    // 判断返回的 pools 的数量、参数是否正确
    const pools = await poolManager.getAllPools();
    expect(pools.length).to.equal(2);
    expect(pools[0].token0).to.equal(token0);
    expect(pools[0].token1).to.equal(token1);
    expect(pools[0].sqrtPriceX96).to.equal(
      BigInt(encodeSqrtRatioX96(100, 1).toString())
    );
    expect(pools[1].token0).to.equal(token2);
    expect(pools[1].token1).to.equal(token3);
    expect(pools[1].sqrtPriceX96).to.equal(
      BigInt(encodeSqrtRatioX96(200, 1).toString())
    );
  });
  it("require token0 < token1", async function () {
    await expect(
      poolManager.createAndInitializePoolIfNecessary({
        token0: token1,
        token1: token0,
        fee: 3000,
        tickLower: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 1)),
        tickUpper: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(10000, 1)),
        sqrtPriceX96: BigInt(encodeSqrtRatioX96(100, 1).toString()),
      })
    ).to.be.revertedWith("TokenA must be less than TokenB");
  });
});
