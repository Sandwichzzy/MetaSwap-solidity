// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DebugToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address recipient, uint256 quantity) public payable {
        require(quantity > 0, "Amount must be greater than 0");
        require(quantity < 10000000 * 10 ** 18, "Amount must be less than 10000000 * 10 ** 18");
        _mint(recipient, quantity);
    }
}