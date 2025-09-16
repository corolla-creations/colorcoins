// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PurpleCoin is ERC20, ERC20Burnable, ERC20Capped, Ownable {
    uint256 public constant CAP = 222_222_222 ether;

    constructor(address initialHolder)
        ERC20("Purple Coin", "PURPLE")
        ERC20Capped(CAP)
        Ownable(msg.sender)
    {
        address to = initialHolder == address(0) ? msg.sender : initialHolder;
        _mint(to, CAP);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
    {
        super._update(from, to, value);
    }
}
