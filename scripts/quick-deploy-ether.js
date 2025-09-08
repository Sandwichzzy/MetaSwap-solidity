// 快速部署脚本 - 用于开发和测试
const { ethers, network } = require("hardhat");

async function main() {
  console.log("🚀 Starting quick deployment...");
  console.log(`Network: ${network.name}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`
  );

  // 1. 部署 Factory
  console.log("\n📦 Deploying Factory...");
  const Factory = await ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  await factory.deployed();
  console.log(`✅ Factory deployed to: ${factory.address}`);

  // 2. 部署 PoolManager
  console.log("\n📦 Deploying PoolManager...");
  const PoolManager = await ethers.getContractFactory("PoolManager");
  const poolManager = await PoolManager.deploy();
  await poolManager.deployed();
  console.log(`✅ PoolManager deployed to: ${poolManager.address}`);

  // 3. 部署 SwapRouter
  console.log("\n📦 Deploying SwapRouter...");
  const SwapRouter = await ethers.getContractFactory("SwapRouter");
  const swapRouter = await SwapRouter.deploy(poolManager.address);
  await swapRouter.deployed();
  console.log(`✅ SwapRouter deployed to: ${swapRouter.address}`);

  // 4. 部署 PositionManager
  console.log("\n📦 Deploying PositionManager...");
  const PositionManager = await ethers.getContractFactory("PositionManager");
  const positionManager = await PositionManager.deploy(poolManager.address);
  await positionManager.deployed();
  console.log(`✅ PositionManager deployed to: ${positionManager.address}`);

  // 5. 部署测试代币 (仅测试网络)
  if (network.config.chainId !== 1) {
    try {
      console.log("\n📦 Deploying test tokens...");
      const MyToken = await ethers.getContractFactory("MyToken");
      const myToken = await MyToken.deploy();
      await myToken.deployed();
      console.log(`✅ MyToken deployed to: ${myToken.address}`);
    } catch (error) {
      console.log("⚠️  MyToken deployment skipped (contract may not exist)");
    }
  }

  // 部署总结
  console.log("\n" + "=".repeat(50));
  console.log("🎉 Quick Deployment Summary");
  console.log("=".repeat(50));
  console.log(`Factory: ${factory.address}`);
  console.log(`PoolManager: ${poolManager.address}`);
  console.log(`SwapRouter: ${swapRouter.address}`);
  console.log(`PositionManager: ${positionManager.address}`);
  console.log("=".repeat(50));

  // 保存地址到文件
  const fs = require("fs");
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    timestamp: new Date().toISOString(),
    contracts: {
      Factory: factory.address,
      PoolManager: poolManager.address,
      SwapRouter: swapRouter.address,
      PositionManager: positionManager.address,
    },
  };

  fs.writeFileSync(
    `deployments-${network.name}-${Date.now()}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(
    `📝 Deployment info saved to deployments-${network.name}-${Date.now()}.json`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
