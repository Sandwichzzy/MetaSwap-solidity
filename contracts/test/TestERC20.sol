//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestERC20
 * @dev 测试用的ERC20代币合约
 */
contract TestERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, totalSupply);
    }

    /**
     * @dev 铸造代币 - 仅用于测试
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @dev 销毁代币 - 仅用于测试
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
} 