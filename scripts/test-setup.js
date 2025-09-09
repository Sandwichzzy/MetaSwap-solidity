const { ethers } = require("hardhat");
const { TickMath, encodeSqrtRatioX96 } = require("@uniswap/v3-sdk");

// 创建简单的ERC20测试代币函数
async function deployTestToken(name, symbol, totalSupply) {
  const TestToken = await ethers.getContractFactory("TestERC20");
  const token = await TestToken.deploy(name, symbol, totalSupply);
  await token.waitForDeployment();
  return token;
}
// 设置测试环境
async function setUpTestEnvironment() {
  const [deployer, user1, user2, user3] = await ethers.getSigners();

  // 部署Factory合约
  const Factory = await ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  // 部署PoolManager合约
  const PoolManager = await ethers.getContractFactory("PoolManager");
  const poolManager = await PoolManager.deploy();
  await poolManager.waitForDeployment();

  // 部署SwapRouter合约
  const SwapRouter = await ethers.getContractFactory("SwapRouter");
  const swapRouter = await SwapRouter.deploy(await poolManager.getAddress());
  await swapRouter.waitForDeployment();

  // 部署PositionManager合约
  const PositionManager = await ethers.getContractFactory("PositionManager");
  const positionManager = await PositionManager.deploy(
    await poolManager.getAddress()
  );
  await positionManager.waitForDeployment();

  return {
    deployer,
    user1,
    user2,
    user3,
    factory,
    poolManager,
    swapRouter,
    positionManager,
    deployTestToken,
  };
}

// 常用测试工具函数
const testUtils = {
  // 创建测试代币对
  async createTokenPair(deployTestTokenFn) {
    const tokenA = await deployTestTokenFn(
      "Token A",
      "TKNA",
      ethers.parseEther("100000000000000000000")
    );
    const tokenB = await deployTestTokenFn(
      "Token B",
      "TKNB",
      ethers.parseEther("100000000000000000000")
    );
    return { tokenA, tokenB };
  },

  // 排序代币地址（模拟Factory中的sortToken逻辑）
  sortTokens(tokenA, tokenB) {
    return tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  },

  // 计算tick值（简化版）
  getTickFromPrice(price) {
    // 这是一个简化的实现，实际应该使用TickMath库
    return Math.floor(Math.log(price) / Math.log(1.0001));
  },

  // 常用测试常量
  constants: {
    FEE_TIER_LOW: 500, // 0.05%
    FEE_TIER_MEDIUM: 3000, // 0.3%
    FEE_TIER_HIGH: 10000, // 1%
    TICK_LOWER: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 1)),
    TICK_UPPER: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(40000, 1)),
    MIN_TICK: TickMath.MIN_TICK,
    MAX_TICK: TickMath.MAX_TICK,
  },
};

module.exports = {
  setUpTestEnvironment,
  deployTestToken,
  testUtils,
};
