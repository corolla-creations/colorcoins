// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VestingVault
/// @notice Holds a single ERC20 for a beneficiary with cliff and linear vesting thereafter.
contract VestingVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;        // the vested token
    address public immutable beneficiary; // who ultimately receives vested tokens
    uint64  public immutable start;       // vest start timestamp (seconds)
    uint64  public immutable cliff;       // seconds after start before anything vests
    uint64  public immutable duration;    // total seconds from start over which vesting completes

    uint256 public released;              // total amount already released

    event TokensReleased(uint256 amount);

    constructor(
        IERC20 _token,
        address _beneficiary,
        uint64 _start,
        uint64 _cliff,
        uint64 _duration
    ) Ownable(msg.sender) {
        require(address(_token) != address(0), "token=0");
        require(_beneficiary != address(0), "beneficiary=0");
        require(_duration > 0 && _cliff <= _duration, "bad schedule");

        token = _token;
        beneficiary = _beneficiary;
        start = _start;
        cliff = _cliff;
        duration = _duration;
    }

    /// @notice Total vested amount at `timestamp` (already released + still held, up to linear schedule).
    function vestedAmount(uint64 timestamp) public view returns (uint256) {
        uint256 total = token.balanceOf(address(this)) + released;
        if (timestamp < start + cliff) return 0;
        if (timestamp >= start + duration) return total;
        uint256 elapsed = timestamp - start;
        return (total * elapsed) / duration;
    }

    /// @notice Amount currently releasable to the beneficiary.
    function releasable() public view returns (uint256) {
        return vestedAmount(uint64(block.timestamp)) - released;
    }

    /// @notice Releases currently releasable tokens to the beneficiary.
    /// @dev Anyone can call; funds always go to `beneficiary`.
    function release() external {
        uint256 amount = releasable();
        require(amount > 0, "nothing releasable");
        released += amount;               // effects before interaction
        token.safeTransfer(beneficiary, amount);
        emit TokensReleased(amount);
    }

    /// @notice Rescue tokens sent here by mistake (not the vested `token`).
    function rescueToken(IERC20 other, address to, uint256 amount) external onlyOwner {
        require(address(other) != address(token), "cannot rescue vested token");
        require(to != address(0), "to=0");
        other.safeTransfer(to, amount);
    }
}
