# MetaSwap 合约部署指南

## 📋 概述

MetaSwap 是一个基于 UniswapV3 的去中心化交易所，支持集中流动性和多池交易。

## 🏗️ 合约架构

```
Factory (工厂合约)
  ↓
PoolManager (池管理合约，继承Factory)
  ↓
SwapRouter (交易路由合约) + PositionManager (头寸管理合约)
```

## 📦 部署脚本

| 脚本文件                        | 合约            | 依赖        | 描述                     |
| ------------------------------- | --------------- | ----------- | ------------------------ |
| `01-deploy-factory.js`          | Factory         | 无          | 部署工厂合约             |
| `02-deploy-pool-manager.js`     | PoolManager     | Factory     | 部署池管理合约           |
| `03-deploy-swap-router.js`      | SwapRouter      | PoolManager | 部署交易路由合约         |
| `04-deploy-position-manager.js` | PositionManager | PoolManager | 部署头寸管理合约         |
| `05-deploy-test-tokens.js`      | MyToken         | 无          | 部署测试代币（仅测试网） |
| `99-deployment-summary.js`      | -               | 所有        | 显示部署总结             |

## 🚀 部署命令

### 1. 部署所有合约

```bash
# 本地网络
npx hardhat deploy --network hardhat

# Sepolia 测试网
npx hardhat deploy --network sepolia

# 主网（请谨慎操作）
npx hardhat deploy --network mainnet
```

### 2. 按标签部署

```bash
# 只部署核心合约
npx hardhat deploy --tags core --network sepolia

# 只部署外围合约
npx hardhat deploy --tags periphery --network sepolia

# 只部署测试代币
npx hardhat deploy --tags test --network sepolia
```

### 3. 部署特定合约

```bash
# 只部署 Factory
npx hardhat deploy --tags Factory --network sepolia

# 只部署 SwapRouter
npx hardhat deploy --tags SwapRouter --network sepolia
```

## 🔧 环境配置

### 1. 环境变量设置

在 `.env` 文件中配置：

```bash
# 网络配置
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
MAINNET_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

# 私钥
PRIVATE_KEY=your_private_key_here
PRIVATE_KEY2=second_account_private_key
PRIVATE_KEY3=third_account_private_key

# Etherscan API Key (用于合约验证)
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 2. 网络配置

确保 `hardhat.config.js` 中配置了正确的网络：

```javascript
networks: {
  sepolia: {
    url: process.env.SEPOLIA_URL,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 11155111,
  },
  // ...
}
```

## 🔍 Sepolia 网络特殊说明

### 自动验证

- 所有合约在 Sepolia 网络部署后会自动在 Etherscan 上验证
- 需要配置 `ETHERSCAN_API_KEY` 环境变量
- 验证失败不会影响部署过程

### 等待确认

- Sepolia 网络部署后会等待 6 个区块确认
- 确保交易稳定性和验证成功率

## 📊 部署后验证

### 1. 查看部署结果

```bash
# 查看所有已部署合约
npx hardhat deployments --network sepolia

# 导出合约地址
npx hardhat export --network sepolia --export deployments.json
```

### 2. 验证合约功能

```bash
# 运行测试
npx hardhat test --network sepolia

# 验证合约交互
npx hardhat console --network sepolia
```

## 🛠️ 常见问题

### 1. 部署失败

```bash
# 清理部署缓存
rm -rf deployments/

# 重新编译
npx hardhat clean
npx hardhat compile

# 重新部署
npx hardhat deploy --network sepolia --reset
```

### 2. 验证失败

```bash
# 手动验证合约
npx hardhat verify --network sepolia CONTRACT_ADDRESS "CONSTRUCTOR_ARG1" "CONSTRUCTOR_ARG2"
```

### 3. Gas 费用过高

```bash
# 设置 Gas 价格
npx hardhat deploy --network sepolia --gasprice 20000000000
```

## 📈 部署后步骤

1. **创建交易池**：使用 `PoolManager.createPool()` 创建代币对池子
2. **添加流动性**：使用 `PositionManager` 添加流动性
3. **执行交易**：使用 `SwapRouter` 执行代币交换
4. **监控事件**：监听合约事件，跟踪交易状态

## 🔐 安全提醒

- ⚠️ 主网部署前请充分测试
- 🔒 保护好私钥，不要提交到代码库
- 💰 确保部署账户有足够的 ETH 支付 Gas 费用
- 📝 记录所有部署的合约地址

## 📞 支持

如遇到问题，请检查：

1. 网络连接是否正常
2. 私钥和 API Key 是否正确配置
3. 账户余额是否充足
4. 合约代码是否编译成功
