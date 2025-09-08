const { network, run } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // 只在测试网络部署测试代币
  if (network.config.chainId === 1) {
    console.log("Skipping test tokens deployment on mainnet");
    return;
  }

  console.log("Deploying test tokens...");
  console.log("Network:", network.name);

  // 部署测试代币 (如果ERC721/MyToken.sol存在)
  try {
    const myToken = await deploy("MyToken", {
      from: deployer,
      args: [],
      log: true,
      waitConfirmations: network.config.chainId === 11155111 ? 6 : 1,
    });

    console.log(`MyToken deployed to: ${myToken.address}`);

    // Sepolia网络验证
    if (network.config.chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
      console.log("Verifying MyToken on Etherscan...");
      try {
        await run("verify:verify", {
          address: myToken.address,
          constructorArguments: [],
        });
        console.log("MyToken verified successfully");
      } catch (error) {
        console.log("MyToken verification failed:", error.message);
      }
    }

    return myToken;
  } catch (error) {
    console.log(
      "MyToken contract not found or deployment failed:",
      error.message
    );
  }
};

module.exports.tags = ["TestTokens", "test"];
module.exports.id = "deploy_test_tokens";
