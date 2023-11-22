// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStonks {
    function getOrderParameters()
        external
        view
        returns (IERC20, IERC20, address, uint256, uint256);
}
