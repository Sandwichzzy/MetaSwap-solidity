//SPDX-License-Identifier: MIT
//这个合约并不是必须的，它只是为了给前端提供数据，
//推荐将这些数据存储在服务端（Uniswap 的做法），
//通过调用服务端的接口来保存、获取这些数据，
//这样的话既可以提高操作数据的响应速度，又可以减少合约存储数据的 gas 开销。

pragma solidity ^0.8.0;

import "./interfaces/IPoolManager.sol";
import "./Factory.sol";
import "./interfaces/IPool.sol";

contract PoolManager is Factory,IPoolManager {

    Pair[] public pairs;

    //用于查询 DEX 是否支持某一交易对的交易
    function getPairs() external view override returns (Pair[] memory){
        return pairs;
    }

    /// @notice 获取所有池子信息 未优化（gas 消耗太大 正常后端返回）
    function getAllPools() external view override returns (PoolInfo[] memory poolsInfo){
        uint32 length=0;
         // 先算一下大小，从 pools 获取
        for (uint32 i=0;i<pairs.length;i++){
            length+=uint32(pools[pairs[i].token0][pairs[i].token1].length);
        }
        // 再填充数据
        poolsInfo = new PoolInfo[](length);
        uint256 index;
        for (uint32 i=0;i<pairs.length;i++){
            // 获取同一交易对的所有池子
            address[] memory addresses =pools[pairs[i].token0][pairs[i].token1];
                for(uint32 j=0;j<addresses.length;j++){
                    IPool pool=IPool(addresses[j]);
                    poolsInfo[index] = PoolInfo(
                        {
                            pool: addresses[j],
                            token0: pool.token0(),
                            token1: pool.token1(),
                            index: j,
                            fee: pool.fee(),
                            feeProtocol: 0,
                            tickLower: pool.tickLower(),
                            tickUpper: pool.tickUpper(),
                            tick: pool.tick(),
                            sqrtPriceX96: pool.sqrtPriceX96(),
                            liquidity: pool.liquidity()
                        }
                    );
                    index++;
                }
            }
            return poolsInfo;
    }

    
    
    function createAndInitializePoolIfNecessary(CreateAndInitializeParams calldata params) external payable override returns (address poolAddress){
        // 要求 token0 < token1。因为在这个方法中需要传入初始化的价格，而在交易池中价格是按照 token0/token1 的方式计算的，
        // 做这个限制可以避免 LP 不小心初始化错误的价格。
        require(params.token0 < params.token1, "TokenA must be less than TokenB");

        // 创建池子
        poolAddress = this.createPool(params.token0, params.token1, params.tickLower, params.tickUpper, params.fee);
        // 获取池子合约
        IPool pool =IPool(poolAddress);
        // 获取同一交易对的数量
        uint256 index=pools[pool.token0()][pool.token1()].length;

         // 新创建的池子，没有初始化价格，需要初始化价格
         if(pool.sqrtPriceX96() == 0){
            pool.initialize(params.sqrtPriceX96);

            if (index ==1){
                pairs.push(Pair(pool.token0(),pool.token1()));
            }
         }

    }


}