// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IPool.sol";

interface ISwapRouter is ISwapCallback{
    event Swap(
        address indexed sender,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountInRemaining,
        uint256 amountOut
    );

    struct ExactInputParams {
        address tokenIn;           // 输入代币
        address tokenOut;          // 输出代币
        uint32[] indexPath;        // 交易路径
        address recipient;         // 接收者
        uint256 deadline;          // 截止时间
        uint256 amountIn;          // 指定输入数量（用户确定）
        uint256 amountOutMinimum;  // 最少输出数量（滑点保护）
        uint160 sqrtPriceLimitX96; // 价格限制
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
    
    struct ExactOutputParams {
        address tokenIn;           // 输入代币
        address tokenOut;          // 输出代币
        uint32[] indexPath;        // 交易路径
        address recipient;         // 接收者
        uint256 deadline;          // 截止时间
        uint256 amountOut;         // 指定输出数量（用户确定）
        uint256 amountInMaximum;   // 最多输入数量（滑点保护）
        uint160 sqrtPriceLimitX96; // 价格限制
    }

     function exactOutput(
        ExactOutputParams calldata params
    ) external payable returns (uint256 amountIn);

    struct QuoteExactInputParams {
        address tokenIn;
        address tokenOut;
        uint32[] indexPath;
        uint256 amountIn;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInput(
        QuoteExactInputParams calldata params
    ) external returns (uint256 amountOut);

     struct QuoteExactOutputParams {
        address tokenIn;
        address tokenOut;
        uint32[] indexPath;
        uint256 amountOut;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactOutput(
        QuoteExactOutputParams calldata params
    ) external returns (uint256 amountIn);
}