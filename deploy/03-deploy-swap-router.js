const { network, run } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying SwapRouter contract...");
  console.log("Network:", network.name);

  // 获取已部署的PoolManager地址
  const poolManager = await get("PoolManager");
  console.log(`Using PoolManager at: ${poolManager.address}`);

  const swapRouter = await deploy("SwapRouter", {
    from: deployer,
    args: [poolManager.address],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  console.log(`SwapRouter deployed to: ${swapRouter.address}`);

  // Sepolia网络验证
  if (network.config.chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying SwapRouter on Etherscan...");
    try {
      await run("verify:verify", {
        address: swapRouter.address,
        constructorArguments: [poolManager.address],
      });
      console.log("SwapRouter verified successfully");
    } catch (error) {
      console.log("SwapRouter verification failed:", error.message);
    }
  } else {
    console.log("Skipping verification - not on Sepolia or no API key");
  }

  return swapRouter;
};

module.exports.tags = ["SwapRouter", "periphery"];
module.exports.dependencies = ["PoolManager"];
