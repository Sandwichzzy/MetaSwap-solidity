const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying DebugToken contract...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer);

  const debugTokenA = await deploy("DebugToken", {
    from: deployer,
    args: ["DebugTokenA", "DTA"],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  const debugTokenB = await deploy("DebugToken", {
    from: deployer,
    args: ["DebugTokenB", "DTB"],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  const debugTokenC = await deploy("DebugToken", {
    from: deployer,
    args: ["DebugTokenC", "DTC"],
    log: true,
    waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
  });

  console.log(`DebugTokenA deployed to: ${debugTokenA.address}`);
  console.log(`DebugTokenB deployed to: ${debugTokenB.address}`);
  console.log(`DebugTokenC deployed to: ${debugTokenC.address}`);

  return { debugTokenA, debugTokenB, debugTokenC };
};

module.exports.tags = ["debugToken", "core"];
