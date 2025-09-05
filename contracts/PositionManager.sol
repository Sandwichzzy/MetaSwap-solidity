//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
 
 // 和Uniswap V3 的 NonfungiblePositionManager.sol 合约类似，都是用于管理用户头寸的合约。
 // PositionManager 合约是为了方便用户管理自己的流动性，而不是直接调用交易池合约
 //和 NonfungiblePositionManager 一样，PositionManager 
 //也是一个满足 ERC721 标准的合约，这样用户可以很方便的通过 NFT 的方式来管理自己的合约