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
    using SafeCast for uint256;
    using LowGasSafeMath for int256;
    using LowGasSafeMath for uint256;
    address public immutable override factory;
    address public immutable override token0;
    address public immutable override token1;
    uint24 public immutable override fee;
    int24 public immutable override tickLower;
    int24 public immutable override tickUpper;

    uint160 public immutable override sqrtPriceX96;
    int24 public immutable override tick;
    uint128 public immutable override liquidity;

    uint256 public immutable override feeGrowthGlobal0X128;
    uint256 public immutable override feeGrowthGlobal1X128;

    mapping(address => Position) public  positions; 

    // 记录流动性
    struct Position{
        uint128 liquidity;// 该 Position 拥有的流动性
        uint256 tokensOwed0;// 可提取的 token0 数量
        uint256 tokensOwed1;// 可提取的 token1 数量
        uint256 feeGrowthInside0LastX128;// 上次提取手续费时的 feeGrowthGlobal0X128
        uint256 feeGrowthInside1LastX128;// 上次提取手续费是的 feeGrowthGlobal1X128
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
         // 通过价格获取 tick，判断 tick 是否在 tickLower 和 tickUpper 之间
        tick=TickMath.getTickAtSqrtRatio(_sqrtPriceX96);
        require(tick >= tickLower && tick <= tickUpper, "sqrtPriceX96 should be within the range of [tickLower, tickUpper)");
        // 初始化 Pool 的 sqrtPriceX96
        sqrtPriceX96 = _sqrtPriceX96;
    }

    
    struct ModifyPositionParams {
         // the address that owns the position
        address owner;
        // any change in liquidity
        int128 liquidityDelta;
    }

    // 添加流动性
    // 添加流动性时，需要传入 amount 和 data，amount 是添加的流动性数量，data 是回调数据
    // recipient 流动性的权益赋予谁
    // return amount0 和 amount1 是添加流动性后需要多少 amount0 和 amount1
    // 添加流动性后，需要回调 mintCallback 方法，这个方法需要传入 amount0 和 amount1，
    function mint(address recipent,uint128 amount,bytes calldata data) 
        external override returns (uint256 amount0,uint256 amount1){
            require(amount > 0, "Amount must be greater than 0");
            // 基于 amount 计算出当前需要多少 amount0 和 amount1
            (int256 amount0Int,int256 amount1Int) = _modifyPosition(
                ModifyPositionParams({
                    owner: recipent, 
                    liquidityDelta: amount
                })
            );
            amount0=uint256(amount0Int);
            amount1=uint256(amount1Int);
            uint256 balance0Before;
            uint256 balance1Before;
            if (amount0 > 0) balance0Before=_balance0();
            if (amount1 > 0) balance1Before=_balance1();
            // 回调 mintCallback 调用 `mint` 方法的合约需要实现 `IUniswapV3MintCallback` 接口完成代币的转入操作：
            IMintCallback(msg.sender).mintCallback(amount0, amount1, data);
            //回调完成后会检查交易池合约的对应余额是否发生变化，并且增量应该大于 amount0 和 amount1：这意味着调用方确实转入了所需的资产。
            if (amount0 > 0) {
                require(balance0Before.add(amount0)<=_balance0(), "M0");
            }
            if (amount1 > 0) {
                require(balance1Before.add(amount1)<=_balance1(), "M1");
            }
            // 触发 Mint 事件
            emit Mint(msg.sender, recipent, amount, amount0, amount1);
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

        // 获取当前用户的 position，recipient 应该改为 msg.sender
        Position storage position = positions[params.owner];

        //关键步骤：结算未领取的费用
        //将费用增长因子差值乘以头寸原有的流动性数量，再除以 Q128（一个固定点数精度常量），得到应累加的费用代币数量。
        uint tokensOwed0 = uint128(FullMath.mulDiv(feeGrowthGlobal0X128-position.feeGrowthInside0LastX128,position.liquidity,FixedPoint128.Q128));
        uint tokensOwed1 = uint128(FullMath.mulDiv(feeGrowthGlobal1X128-position.feeGrowthInside1LastX128,position.liquidity,FixedPoint128.Q128));

         // 更新提取手续费的记录，同步到当前最新的 feeGrowthGlobal0X128，代表都提取完了
        position.feeGrowthInside0LastX128 = feeGrowthGlobal0X128;
        position.feeGrowthInside1LastX128 = feeGrowthGlobal1X128;
        // 把可以提取的手续费记录到 tokensOwed0 和 tokensOwed1 中
        // LP 可以通过 collect 来最终提取到用户自己账户上
        if (tokensOwed0 > 0) {
            position.tokensOwed0 += tokensOwed0;
        }
        if (tokensOwed1 > 0) {
            position.tokensOwed1 += tokensOwed1;
        }
        // 修改 liquidity 和 position.liquidity
        liquidity=LiquidityMath.addDelta(liquidity,params.liquidityDelta);
        position.liquidity=LiquidityMath.addDelta(position.liquidity,params.liquidityDelta);
    }


    //它不需要有回调，另外提取代币是放到 collect 中操作的。
    //在 burn 方法中，我们只是把流动性移除，并计算出要退回给 LP 的 amount0 和 amount1，记录在合约状态中
    function burn(uint128 amount) external override returns (uint256 amount0,uint256 amount1){
        require(amount > 0, "Burn Amount must be greater than 0");
        require(amount <=positions[msg.sender].liquidity,"Burn amount exceeds liquidity");
        // 修改 positions 中的信息
        (int256 amount0Int,int256 amount1Int)=_modifyPosition(ModifyPositionParams({
            owner: msg.sender,
            liquidityDelta: -int128(amount)
        }));
        // 获取燃烧后的退换的 amount0 和 amount1
        amount0=uint256(-amount0Int);
        amount1=uint256(-amount1Int);

        if (amount0 > 0 || amount1 > 0) {
            (
                positions[msg.sender].tokensOwed0,
                positions[msg.sender].tokensOwed1
            ) = (
                positions[msg.sender].tokensOwed0 + uint128(amount0),
                positions[msg.sender].tokensOwed1 + uint128(amount1)
            );
        }

        emit Burn(msg.sender, amount, amount0, amount1);
    }

    //Position 中定义了 tokensOwed0 和 tokensOwed1，
    //用来记录 LP 可以提取的代币数量，这个代币数量是在 collect 中提取的
    function collect(address recipient,uint128 amount0Requested,uint128 amount1Requested) 
        external override returns (uint128 amount0,uint128 amount1){
            // 获取当前用户的 position
            Position storage position = positions[msg.sender];
            // 把钱退给用户 recipient
            amount0=amount0Requested>position.tokensOwed0?position.tokensOwed0:amount0Requested;
            amount1=amount1Requested>position.tokensOwed1?position.tokensOwed1:amount1Requested;

            if (amount0 > 0) {
                position.tokensOwed0 -= amount0;
                TransferHelper.safeTransfer(token0, recipient, amount0);
            }
            if (amount1 > 0) {
                position.tokensOwed1 -= amount1;
                TransferHelper.safeTransfer(token1, recipient, amount1);
            }
            // 触发 Collect 事件
            emit Collect(recipient, amount0, amount1);
    }

    function swap(address recipient, 
        bool zeroForOne, 
        int256 amountSpecified, 
        uint160 sqrtPriceLimitX96, 
        bytes calldata data) external override returns (int256 amount0, int256 amount1){

    }
    /// @dev Get the pool's balance of token0
    function _balance0() private view returns (uint256){
        (bool success,bytes memory data)=token0.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        require(success&&data.length>=32,"Failed to get balance of token0");
        return abi.decode(data, (uint256));
    }

    function _balance1() private view returns (uint256){
        (bool success,bytes memory data)=token1.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        require(success&&data.length>=32,"Failed to get balance of token1");
        return abi.decode(data, (uint256));
    }
}
