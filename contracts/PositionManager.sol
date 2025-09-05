//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
 
 // 和Uniswap V3 的 NonfungiblePositionManager.sol 合约类似，都是用于管理用户头寸的合约。
 // PositionManager 合约是为了方便用户管理自己的流动性，而不是直接调用交易池合约
 //和 NonfungiblePositionManager 一样，PositionManager 
 //也是一个满足 ERC721 标准的合约，这样用户可以很方便的通过 NFT 的方式来管理自己的合约

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./libraries/LiquidityAmounts.sol";
import "./libraries/TickMath.sol";
import "./libraries/FixedPoint128.sol";

import "./interfaces/IPositionManager.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolManager.sol";


//对于 Pool 合约来说，流动性都是 PositionManager 合约掌管，
//PositionManager 相当于代管了 LP 的流东西，所以需要在它内部再存储下相关信息。
contract PositionManager is IPositionManager, ERC721,IMintCallback{
    // 保存 PoolManager 合约地址
    IPoolManager public poolManager;
    /// @dev The ID of the next token that will be minted. Skips 0
    uint256 private _nextId =1;

    constructor(address _poolManager)ERC721("MetaSwapPosition","MSP"){
        poolManager = IPoolManager(_poolManager);
    }
    // 用一个 mapping 来存放所有 Position 的信息
    mapping(uint256 => PositionInfo) public positions;



    function getSender() public view returns (address){
        return msg.sender;
    }

    function _blockTimestamp() internal view virtual returns (uint256){
        return block.timestamp;
    }

    modifier checkDeadline(uint256 deadline){
        require(deadline>=_blockTimestamp(),"Transaction too old");
        _;
    }

    modifier isAuthorizedForToken(uint256 tokenId){
        address owner=ERC721.ownerOf(tokenId);
        require(_isAuthorized(owner,msg.sender,tokenId),"Not approved");
        _;
    }

    function mint(MintParams calldata params) external payable override 
        checkDeadline(params.deadline) 
        returns (uint256 positionId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        // mint 一个 NFT 作为 position 发给 LP
        // NFT 的 tokenId 就是 positionId
        // 通过 MintParams 里面的 token0 和 token1 以及 index 获取对应的 Pool
        // 调用 poolManager 的 getPool 方法获取 Pool 地址
        address _pool=poolManager.getPool(params.token0,params.token1,params.index);
        Ipool pool=Ipool(_pool);

        // 通过获取 pool 相关信息，结合 params.amount0Desired 和 params.amount1Desired 计算这次要注入的流动性
        uint160 sqrtPriceX96=pool.sqrtPriceX96();
        uint160 sqrtRatioAX96=TickMath.getSqrtPriceAtTick(pool.tickLower());
        uint160 sqrtRatioBX96=TickMath.getSqrtPriceAtTick(pool.tickUpper());
        liquidity=LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            params.amount0Desired,
            params.amount1Desired
        );
        // data 是 mint 后回调 PositionManager 会额外带的数据
        // 需要 PoistionManger 实现回调mintCallback，在回调中给 Pool 打钱
        bytes memory data=abi.encode(params.token0,params.token1,params.index,msg.sender)
        (amount0,amount1)=pool.mint(address(this),liquidity,data);
        // 创建 NFT 并发送给LP
        _mint(params.recipient,(positionId=_nextId++));
        // 更新 PositionInfo 信息
        (,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,)=pool.getPosition(address(this));

        positions[positionId]=PositionInfo({
            id:positionId,
            owner:params.recipient,
            token0:params.token0,
            token1:params.token1,
            index:params.index,
            fee:pool.fee(),
            liquidity:liquidity,
            tickLower:pool.tickLower(),
            tickUpper:pool.tickUpper(),
            tokensOwed0:0,
            tokensOwed1:0,
            feeGrowthInside0LastX128:feeGrowthInside0LastX128,
            feeGrowthInside1LastX128:feeGrowthInside1LastX128
        });
    }

    function burn(uint256 positionId) external override isAuthorizedForToken(positionId) 
        returns (uint256 amount0, uint256 amount1)
    {
        PositionInfo storage position=positions[positionId];
        // 通过 isAuthorizedForToken 检查 positionId 是否有权限
        // 移除流动性，但是 token 还是保留在 pool 中，需要再调用 collect 方法才能取回 token
        // 通过 positionId 获取对应 LP 的流动性
        uint128 _liquidity=position.liquidity;
         // 调用 Pool 的方法给 LP 退流动性
        address _pool=poolManager.getPool(position.token0,position.token1,position.index);
        Ipool pool=Ipool(_pool);
        (amount0,amount1)=pool.burn(_liquidity);
        // 计算这部分流动性产生的手续费
        (
            ,//_liquidity
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            ,
        ) = pool.getPosition(address(this));

        position.tokensOwed0+=uint128(amount0)+uint128(FullMath.mulDiv(feeGrowthInside0LastX128-position.feeGrowthInside0LastX128,positon.liquidity,FixedPoint128.Q128));
        position.tokensOwed1+=uint128(amount1)+uint128(FullMath.mulDiv(feeGrowthInside1LastX128-position.feeGrowthInside1LastX128,positon.liquidity,FixedPoint128.Q128));

        // 更新 position 的信息
        position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        position.liquidity = 0;
    }
    
    function collect(uint256 positionId,address recipient) external override isAuthorizedForToken(positionId) 
        returns (uint256 amount0,uint256 amount1)
    {
        // 通过 isAuthorizedForToken 检查 positionId 是否有权限
        // 调用 Pool 的方法给 LP 退流动性
        PositionInfo storage position=positions[positionId];
        address _pool=poolManager.getPool(position.token0,position.token1,position.index);
        Ipool pool=Ipool(_pool);
        (amount0, amount1) = pool.collect(
            recipient,
            position.tokensOwed0,
            position.tokensOwed1
        );

        // position 已经彻底没用了，销毁
        position.tokensOwed0 = 0;
        position.tokensOwed1 = 0;
        // 销毁 NFT
        _burn(positionId);
    }

    // 获取全部的Position信息
    function getAllPositions() external view returns (PositionInfo[] memory positionInfo){
        positionInfo = new PositionInfo[](_nextId-1);
        for(uint32 i=0;i<_nextId-1;i++){
            positionInfo[i] = positions[i+1];
        }
        return positionInfo;
    }

    function mintCallback(uint256 amount0, uint256 amount1, bytes calldata data) external override{
        //检查callback 的合约地址是否是pool
        (address token0,address token1,uint32 index,address payer)=abi.decode(data,(address,address,uint32,address));
        address _pool=poolManager.getPool(token0,token1,index);
        require(_pool==msg.sender,"Invalid callback caller");

        // 在这里给 Pool 打钱，需要用户先 approve 足够的金额，这里才会成功
        if(amount0>0){
            IERC20(token0).transferFrom(payer,address(this),amount0);
        }
        if(amount1>0){
            IERC20(token1).transferFrom(payer,address(this),amount1);
        }
    }
}