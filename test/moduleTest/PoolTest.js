const { setUpTestEnvironment } = require("../../scripts/test-setup");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pool Test", () => {
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

  it("should create a new pool", async () => {
    const factory = contracts.factory;
    const tokenA = contracts.tokenA;
    const tokenB = contracts.tokenB;
    const pool = await factory.createPool(
      tokenA.address,
      tokenB.address,
      1,
      1000000,
      2000000,
      3000
    );
    await pool.wait();
    const poolAddress = await factory.getPool(
      tokenA.address,
      tokenB.address,
      0
    );
    expect(poolAddress).to.not.equal(ethers.ZeroAddress);
  });
});
