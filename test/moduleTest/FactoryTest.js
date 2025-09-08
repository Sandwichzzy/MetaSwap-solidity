const { expect } = require("chai");
const { ethers } = require("hardhat");
const { setUpTestEnvironment, testUtils } = require("../../scripts/test-setup");

describe("Factory Contract Tests", () => {
  let contracts;
  let tokenA, tokenB;
  let factory;
  let deployer, user1;

  beforeEach(async () => {
    contracts = await setUpTestEnvironment();
    factory = contracts.factory;
    deployer = contracts.deployer;
    user1 = contracts.user1;

    // 创建测试代币对
    const tokenPair = await testUtils.createTokenPair(
      contracts.deployTestToken
    );
    tokenA = tokenPair.tokenA;
    tokenB = tokenPair.tokenB;
  });

  describe("Pool Creation", () => {
    it("should create a new pool successfully", async () => {
      const tickLower = -1000;
      const tickUpper = 1000;
      const fee = testUtils.constants.FEE_TIER_MEDIUM;

      const tx = await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        fee
      );

      const receipt = await tx.wait();

      // 检查事件是否正确触发
      const poolCreatedEvent = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "PoolCreated"
      );

      expect(poolCreatedEvent).to.not.be.undefined;

      // 验证事件参数
      const [token0, token1] = testUtils.sortTokens(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );

      expect(poolCreatedEvent.args.token0).to.equal(token0);
      expect(poolCreatedEvent.args.token1).to.equal(token1);
      expect(poolCreatedEvent.args.index).to.equal(0);
      expect(poolCreatedEvent.args.tickLower).to.equal(tickLower);
      expect(poolCreatedEvent.args.tickUpper).to.equal(tickUpper);
      expect(poolCreatedEvent.args.fee).to.equal(fee);
      expect(poolCreatedEvent.args.pool).to.not.equal(ethers.ZeroAddress);
    });

    it("should return existing pool if same parameters", async () => {
      const tickLower = -1000;
      const tickUpper = 1000;
      const fee = testUtils.constants.FEE_TIER_MEDIUM;

      // 第一次创建池子
      const tx1 = await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        fee
      );
      await tx1.wait();

      // 第二次创建相同参数的池子
      const tx2 = await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        fee
      );
      const receipt2 = await tx2.wait();

      // 应该返回相同的池子地址，不创建新池子
      expect(receipt2.logs).to.have.length(0); // 不应该有PoolCreated事件
    });

    it("should create different pools with different parameters", async () => {
      const tickLower = -1000;
      const tickUpper = 1000;

      // 创建不同手续费的池子
      const tx1 = await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        testUtils.constants.FEE_TIER_LOW
      );
      await tx1.wait();
      const pool1Address = await factory.getPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        0
      );

      const tx2 = await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        testUtils.constants.FEE_TIER_HIGH
      );
      await tx2.wait();
      const pool2Address = await factory.getPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        1
      );

      // 应该创建不同的池子
      expect(pool1Address).to.not.equal(pool2Address);
    });
  });

  describe("Parameter Validation", () => {
    it("should revert when tokenA equals tokenB", async () => {
      const tickLower = -1000;
      const tickUpper = 1000;
      const fee = testUtils.constants.FEE_TIER_MEDIUM;

      await expect(
        factory.createPool(
          await tokenA.getAddress(),
          await tokenA.getAddress(), // 相同的token
          tickLower,
          tickUpper,
          fee
        )
      ).to.be.revertedWith("TokenA and TokenB cannot be the same");
    });

    it("should handle zero addresses", async () => {
      const tickLower = -1000;
      const tickUpper = 1000;
      const fee = testUtils.constants.FEE_TIER_MEDIUM;

      // 这个测试可能会因为其他原因失败，但我们主要测试不会因为零地址崩溃
      await expect(
        factory.createPool(
          ethers.ZeroAddress,
          await tokenB.getAddress(),
          tickLower,
          tickUpper,
          fee
        )
      ).to.not.be.reverted;
    });
  });

  describe("Parameters Struct", () => {
    it("should parameters be cleared after pool creation", async () => {
      // 创建池子时会设置parameters
      const tickLower = -1000;
      const tickUpper = 1000;
      const fee = testUtils.constants.FEE_TIER_MEDIUM;

      await factory.createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        tickLower,
        tickUpper,
        fee
      );

      // parameters应该在创建后被清除
      const params = await factory.parameters();
      expect(params.factory).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Multiple Pools Management", () => {
    it("should manage multiple pools for same token pair", async () => {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();

      // 创建3个不同参数的池子
      await factory.createPool(tokenAAddr, tokenBAddr, -1000, 1000, 500);
      await factory.createPool(tokenAAddr, tokenBAddr, -2000, 2000, 3000);
      await factory.createPool(tokenAAddr, tokenBAddr, -500, 500, 10000);

      // 验证可以获取到所有池子
      const pool0 = await factory.getPool(tokenAAddr, tokenBAddr, 0);
      const pool1 = await factory.getPool(tokenAAddr, tokenBAddr, 1);
      const pool2 = await factory.getPool(tokenAAddr, tokenBAddr, 2);

      expect(pool0).to.not.equal(ethers.ZeroAddress);
      expect(pool1).to.not.equal(ethers.ZeroAddress);
      expect(pool2).to.not.equal(ethers.ZeroAddress);
      expect(pool0).to.not.equal(pool1);
      expect(pool1).to.not.equal(pool2);
    });
  });
});
