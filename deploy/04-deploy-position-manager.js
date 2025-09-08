const { network, run } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying PositionManager contract...");
  console.log("Network:", network.name);

  // 获取已部署的PoolManager地址
  const poolManager = await get("PoolManager");
  console.log(`Using PoolManager at: ${poolManager.address}`);

  const positionManager = await deploy("PositionManager", {
    from: deployer,
    args: [poolManager.address],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  console.log(`PositionManager deployed to: ${positionManager.address}`);

  // Sepolia网络验证
  if (network.config.chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying PositionManager on Etherscan...");
    try {
      await run("verify:verify", {
        address: positionManager.address,
        constructorArguments: [poolManager.address],
      });
      console.log("PositionManager verified successfully");
    } catch (error) {
      console.log("PositionManager verification failed:", error.message);
    }
  } else {
    console.log("Skipping verification - not on Sepolia or no API key");
  }

  return positionManager;
};

module.exports.tags = ["PositionManager", "periphery"];
module.exports.dependencies = ["PoolManager"];
