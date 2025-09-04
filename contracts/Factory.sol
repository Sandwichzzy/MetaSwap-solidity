//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IFactory.sol";
import "./Pool.sol";

contract Factory is IFactory {

    Parameters public override parameters;

    mapping(address => mapping(address => address[])) public  pools;

    function sortToken(address tokenA,address tokenB) private pure returns (address,address){
        return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function createPool(address tokenA, address tokenB, int24 tickLower, int24 tickUpper, uint24 fee) 
        external returns (address pool){
        require(tokenA != tokenB, "TokenA and TokenB cannot be the same");

        address token0;
        address token1;
        // sort token, avoid the mistake of the order 将tokenA和tokenB按大小排序
        (token0,token1) = sortToken(tokenA, tokenB);

        //get current all pools
        address[] memory existingPools  = pools[token0][token1];
        // check if the pool already exists 
        // 有点耗gas，可以优化
        for(uint i = 0; i < existingPools.length; i++){
            IPool currentPool =IPool(existingPools[i]);
            if (currentPool.tickLower() == tickLower && 
                currentPool.tickUpper() == tickUpper && 
                currentPool.fee() == fee){
                // if the pool already exists, return the pool
                return existingPools[i];
            }
        }
        //save the pool info
        parameters = Parameters(address(this), tokenA, tokenB, tickLower, tickUpper, fee);
        // generate create2 salt
        bytes32 salt = keccak256(abi.encode(token0, token1, tickLower, tickUpper, fee));
        // create pool
        // salt 来使用 CREATE2 的方式来创建合约，这样的好处是创建出来的合约地址是可预测的，
        // 地址生成的逻辑是 新地址 = hash("0xFF",创建者地址, salt, initcode)
        pool=address(new Pool{salt:salt}());
        // save created pool
        pools[token0][token1].push(pool);
        // delete pool info
        delete parameters;
        //emit PoolCreated event
        emit PoolCreated(token0, token1, uint32(existingPools.length), tickLower, tickUpper, fee, pool);
    }

    function getPool(address tokenA, address tokenB, uint32 index) external view override returns (address pool){
        require(tokenA != tokenB, "TokenA and TokenB cannot be the same");
        require(tokenA != address(0) && tokenB != address(0), "ZERO_ADDRESS");

        address token0;
        address token1;

        (token0,token1) = sortToken(tokenA, tokenB);

        pool = pools[token0][token1][index];

        require(pool != address(0), "POOL_NOT_EXISTS");

        return pool;
    }

    
}