const { network, run } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying PoolManager contract...");
  console.log("Network:", network.name);

  const poolManager = await deploy("PoolManager", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  console.log(`PoolManager deployed to: ${poolManager.address}`);

  // Sepolia网络验证
  if (network.config.chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying PoolManager on Etherscan...");
    try {
      await run("verify:verify", {
        address: poolManager.address,
        constructorArguments: [],
      });
      console.log("PoolManager verified successfully");
    } catch (error) {
      console.log("PoolManager verification failed:", error.message);
    }
  } else {
    console.log("Skipping verification - not on Sepolia or no API key");
  }

  return poolManager;
};

module.exports.tags = ["PoolManager", "core"];
module.exports.dependencies = ["Factory"];
