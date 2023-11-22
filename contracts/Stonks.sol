// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {AssetRecoverer} from "./lib/AssetRecoverer.sol";
import {Order} from "./Order.sol";

contract Stonks is AssetRecoverer {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_BASIS_POINTS = 10_000;

    address public tokenConverter;

    Order public immutable orderSample;

    address public immutable tokenFrom;
    address public immutable tokenTo;

    uint256 public immutable marginInBasisPoints;
    uint256 public immutable priceToleranceInBasisPoints;

    constructor(
        address tokenFrom_,
        address tokenTo_,
        address operator_,
        address tokenConverter_,
        address orderSample_,
        uint256 marginBasisPoints_,
        uint256 priceToleranceInBasisPoints_
    ) {
        require(tokenFrom_ != address(0), "stonks: invalid tokenFrom_ address");
        require(tokenTo_ != address(0), "stonks: invalid tokenTo_ address");
        require(tokenFrom_ != tokenTo_, "stonks: tokenFrom_ and tokenTo_ cannot be the same");
        require(tokenConverter_ != address(0), "stonks: invalid price checker address");
        require(operator_ != address(0), "stonks: invalid operator address");
        require(orderSample_ != address(0), "stonks: invalid order address");
        require(marginBasisPoints_ <= MAX_BASIS_POINTS, "stonks: margin overflow");

        operator = operator_;
        tokenFrom = tokenFrom_;
        tokenTo = tokenTo_;
        tokenConverter = tokenConverter_;
        orderSample = Order(orderSample_);
        marginInBasisPoints = marginBasisPoints_;
        priceToleranceInBasisPoints = priceToleranceInBasisPoints_;
    }

    function placeOrder() external {
        uint256 balance = IERC20(tokenFrom).balanceOf(address(this));

        // Contract needs to hold at least 10 wei to cover steth shares issue
        require(balance > 10, "stonks: insufficient balance");

        Order orderCopy = Order(createOrderCopy());
        IERC20(tokenFrom).safeTransfer(address(orderCopy), balance);
        orderCopy.initialize(operator);
    }

    function getOrderParameters() external view returns (address, address, address, uint256, uint256) {
        return (tokenFrom, tokenTo, tokenConverter, marginInBasisPoints, priceToleranceInBasisPoints);
    }

    function createOrderCopy() internal returns (address orderContract) {
        bytes20 addressBytes = bytes20(address(orderSample));
        assembly {
            let clone_code := mload(0x40)
            mstore(clone_code, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone_code, 0x14), addressBytes)
            mstore(add(clone_code, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            orderContract := create(0, clone_code, 0x37)
        }
    }
}
