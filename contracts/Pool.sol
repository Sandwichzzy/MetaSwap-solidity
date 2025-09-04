//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IFactory.sol";
import "./interfaces/IPool.sol";

contract Pool is IPool {
    address public immutable override factory;
    address public immutable override token0;
    address public immutable override token1;
    uint24 public immutable override fee;
    int24 public immutable override tickLower;
    int24 public immutable override tickUpper;

    uint160 public immutable override sqrtPriceX96;
    int24 public immutable override tick;
    uint128 public immutable override liquidity;

    mapping(address => Position) public  positions; 

    
    constructor(){
        // constructor 中初始化 immutable 的常量
        // Factory 创建 Pool 时会通 new Pool{salt: salt}() 的方式创建 Pool 合约，
        // 通过 salt 指定 Pool 的地址，这样其他地方也可以推算出 Pool 的地址
        // 参数通过读取 Factory 合约的 parameters 获取
        // 不通过构造函数传入，因为 CREATE2 会根据 
        // initcode 计算出新地址（new_address = hash(0xFF, sender, salt, bytecode)），带上参数就不能计算出稳定的地址了
        (factory, token0, token1, fee, tickLower, tickUpper) = IFactory(msg.sender).parameters();
    }

    function initialize(uint160 _sqrtPriceX96) external override {
        // 初始化 Pool 的 sqrtPriceX96
        sqrtPriceX96 = _sqrtPriceX96;
    }

    function mint(address recipent,uint128 amount,bytes calldata data) 
        external override returns (uint256 amount0,uint256 amount1){
        // 基于 amount 计算出当前需要多少 amount0 和 amount1
        // TODO 当前先写个假的
        (amount0, amount1) = (amount / 2, amount / 2);
        // 把流动性记录到对应的 position 中
        positions[recipent].liquidity += amount;
        // 回调 mintCallback
        IMintCallback(msg.sender).mintCallback(amount0, amount1, data);
        // TODO 检查钱到位了没有，如果到位了对应修改相关信息
        // 触发 Mint 事件
        emit Mint(msg.sender, recipent, amount, amount0, amount1);
    }

    function collect(address recipient) external override returns (uint256 amount0,uint256 amount1){
         // 获取当前用户的 position，TODO recipient 应该改为 msg.sender
         Position storage position = positions[recipient];
         // TODO 把钱退给用户 recipient
         // 修改 position 中的信息
         position.tokensOwed0 -= amount0;
         position.tokensOwed1 -= amount1;

         // 触发 Collect 事件
         emit Collect(recipient, amount0, amount1);
    }

    function burn(uint128 amount) external override returns (uint256 amount0,uint256 amount1){
        // 修改 positions 中的信息
        positions[msg.sender].liquidity -= amount;
         // 获取燃烧后的 amount0 和 amount1
        // TODO 当前先写个假的
        (amount0, amount1) = (amount / 2, amount / 2);
        positions[msg.sender].tokensOwed0 += amount0;
        positions[msg.sender].tokensOwed1 += amount1;
        emit Burn(msg.sender, amount, amount0, amount1);
    }

    function swap(address recipient, 
        bool zeroForOne, 
        int256 amountSpecified, 
        uint160 sqrtPriceLimitX96, 
        bytes calldata data) external override returns (int256 amount0, int256 amount1){

    }
}
