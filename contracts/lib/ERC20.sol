// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "./Ownable.sol";

/// @title Minimal ERC20 with Cap and Burn
/// @notice Self-contained ERC20 implementation with supply cap and burn/burnFrom
contract ERC20 is Ownable {
    string public name;
    string public symbol;
    uint8 public immutable decimals = 18;

    uint256 public totalSupply;
    uint256 public immutable cap;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _cap, address initialHolder) {
        require(_cap > 0, "ERC20: cap 0");
        name = _name;
        symbol = _symbol;
        cap = _cap;
        // Mint the full cap to the contract itself by default; owner can distribute later
        // or to a provided initialHolder if non-zero.
        address mintTo = initialHolder == address(0) ? address(this) : initialHolder;
        _mint(mintTo, _cap);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: allowance");
            unchecked { allowance[from][msg.sender] = allowed - amount; }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: allowance");
            unchecked { allowance[from][msg.sender] = allowed - amount; }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _burn(from, amount);
    }

    // Owner-controlled distribution from the contract's own balance
    function distribute(address to, uint256 amount) external onlyOwner {
        _transfer(address(this), to, amount);
    }

    // Batch distribution helper
    function distributeBatch(address[] calldata to, uint256[] calldata amounts) external onlyOwner {
        require(to.length == amounts.length, "ERC20: len");
        for (uint256 i = 0; i < to.length; i++) {
            _transfer(address(this), to[i], amounts[i]);
        }
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ERC20: to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "ERC20: balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "ERC20: mint to zero");
        require(totalSupply + amount <= cap, "ERC20: cap exceeded");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "ERC20: burn amount");
        unchecked { balanceOf[from] = bal - amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}

