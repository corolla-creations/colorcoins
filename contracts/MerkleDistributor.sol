// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
  function transfer(address to, uint256 amount) external returns (bool);
}

library MerkleProof {
  function verify(bytes32[] memory proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
    bytes32 computed = leaf;
    for (uint256 i = 0; i < proof.length; i++) {
      bytes32 p = proof[i];
      computed = computed < p ? keccak256(abi.encodePacked(computed, p))
                              : keccak256(abi.encodePacked(p, computed));
    }
    return computed == root;
  }
}

contract MerkleDistributor {
  address public immutable token;
  bytes32 public immutable merkleRoot;

  mapping(uint256 => uint256) private claimedBitMap;

  event Claimed(uint256 index, address account, uint256 amount);

  constructor(address _token, bytes32 _merkleRoot) {
    token = _token;
    merkleRoot = _merkleRoot;
  }

  function isClaimed(uint256 index) public view returns (bool) {
    uint256 wordIndex = index / 256;
    uint256 bitIndex = index % 256;
    uint256 word = claimedBitMap[wordIndex];
    uint256 mask = (1 << bitIndex);
    return word & mask == mask;
  }

  function _setClaimed(uint256 index) private {
    uint256 wordIndex = index / 256;
    uint256 bitIndex = index % 256;
    claimedBitMap[wordIndex] = claimedBitMap[wordIndex] | (1 << bitIndex);
  }

  function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external {
    require(!isClaimed(index), "Already claimed");
    bytes32 node = keccak256(abi.encodePacked(index, account, amount));
    require(MerkleProof.verify(merkleProof, merkleRoot, node), "Invalid proof");
    _setClaimed(index);
    require(IERC20(token).transfer(account, amount), "Transfer failed");
    emit Claimed(index, account, amount);
  }
}
