const { network, run } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying Factory contract...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer);

  const factory = await deploy("Factory", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  console.log(`Factory deployed to: ${factory.address}`);

  // Sepolia网络验证
  if (network.config.chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying Factory on Etherscan...");
    try {
      await run("verify:verify", {
        address: factory.address,
        constructorArguments: [],
      });
      console.log("Factory verified successfully");
    } catch (error) {
      console.log("Factory verification failed:", error.message);
    }
  } else {
    console.log("Skipping verification - not on Sepolia or no API key");
  }

  return factory;
};

module.exports.tags = ["Factory", "core"];
