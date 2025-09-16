// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VestingVault
/// @notice Holds ERC20 tokens for a beneficiary with cliff + linear vesting thereafter
contract VestingVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable beneficiary;
    uint64 public immutable start;
    uint64 public immutable cliff; // seconds after start
    uint64 public immutable duration; // total seconds from start

    uint256 public released;

    event TokensReleased(uint256 amount);

    constructor(
        IERC20 _token,
        address _beneficiary,
        uint64 _start,
        uint64 _cliff,
        uint64 _duration
    ) Ownable(msg.sender) {
        require(address(_token) != address(0), "token");
        require(_beneficiary != address(0), "beneficiary");
        require(_duration > 0 && _cliff <= _duration, "schedule");
        token = _token;
        beneficiary = _beneficiary;
        start = _start;
        cliff = _cliff;
        duration = _duration;
    }

    function vestedAmount(uint64 timestamp) public view returns (uint256) {
        uint256 total = token.balanceOf(address(this)) + released;
        if (timestamp < start + cliff) return 0;
        if (timestamp >= start + duration) return total;
        uint256 elapsed = timestamp - start;
        return (total * elapsed) / duration;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount(uint64(block.timestamp)) - released;
    }

    function release(address to) external {
        uint256 amount = releasable();
        require(amount > 0, "nothing");
        released += amount;
        address recipient = to == address(0) ? beneficiary : to;
        token.safeTransfer(recipient, amount);
        emit TokensReleased(amount);
    }
}
