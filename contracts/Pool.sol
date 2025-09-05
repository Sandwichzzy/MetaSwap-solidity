//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./libraries/SqrtPriceMath.sol";
import "./libraries/TickMath.sol";
import "./libraries/LiquidityMath.sol";
import "./libraries/LowGasSafeMath.sol";
import "./libraries/TransferHelper.sol";


import "./interfaces/IFactory.sol";
import "./interfaces/IPool.sol";

//MetaSwap每个代币对可能有多个 Pool 合约，每个 Pool 合约就是一个交易池，每个交易池都有自己的价格上下限和手续费
//Uniswap 的交易池只有交易对+手续费属性，而我们的交易池还有价格上下限属性。
//在 Uniswap V3 中，你需要在一个交易池里面去管理在不同价格区间内的流动性
//这里简化了 只需要考虑这个固定范围内的流动性管理和交易即可，
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

    // 记录流动性
    struct Position{
        uint128 liquidity;// 该 Position 拥有的流动性
        uint256 tokensOwed0;// 可提取的 token0 数量
        uint256 tokensOwed1;// 可提取的 token1 数量
    }
    // 用一个 mapping 来存放所有 Position 的信息，key 是地址，value 是 Position 结构体
    mapping(address => Position) public positions;
    
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
        require(sqrtPriceX96 == 0, "Already initialized");
        // 初始化 Pool 的 sqrtPriceX96
        sqrtPriceX96 = _sqrtPriceX96;
    }

    // 添加流动性
    // 添加流动性时，需要传入 amount 和 data，amount 是添加的流动性数量，data 是回调数据
    // recipient 流动性的权益赋予谁
    // return amount0 和 amount1 是添加流动性后需要多少 amount0 和 amount1
    // 添加流动性后，需要回调 mintCallback 方法，这个方法需要传入 amount0 和 amount1，
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

    struct ModifyPositionParams {
         // the address that owns the position
        address owner;
        // any change in liquidity
        int128 liquidityDelta;
    }

    //Uniswap V3 中，计算流动性时的上下限是参数动态传入的 params.tickLower 和 params.tickUpper
    //MetaSwap 交易池都固定在一个价格区间内，mint 也只能在这个价格区间内 mint，所以 tickLower 和 tickUpper 是固定的
    function _modifyPosition(ModifyPositionParams calldata params) private returns(int256 amount0,int256 amount1){
        // 通过新增的流动性计算 amount0 和 amount1
        // 参考 UniswapV3 的代码
        // 用到 SqrtPriceMath 库，这个库是 Uniswap V3 中的一个工具库
        // FullMath.sol 和 TickMath.sol 因为依赖于 solidity <0.8.0;这里用的是 0.8.0+，所以我们使用 Uniswap V4 的代码
        // 当前价格在一定在tick区间内，所以不需要考虑价格超出区间的情况
        amount0=SqrtPriceMath.getAmount0Delta(sqrtPriceX96,TickMath.getSqrtRatioAtTick(tickUpper),params.liquidityDelta);
        amount1=SqrtPriceMath.getAmount1Delta(sqrtPriceX96,TickMath.getSqrtRatioAtTick(tickLower),params.liquidityDelta);

        // 获取当前用户的 position，TODO recipient 应该改为 msg.sender
        Position storage position = positions[params.owner];

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
