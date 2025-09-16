// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBurnable is IERC20 {
    function burn(uint256 amount) external;
}

/// @title ProofOfPaint — 1:1 lock-and-burn staking with 90d lock
/// @notice Users lock tokens for 90 days. On claim, the locked tokens are burned and rewards are paid 1:1 from pre-funded budgets.
contract ProofOfPaint is Ownable, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    uint256 public constant LOCK_PERIOD = 90 days;
    uint256 public constant LOCK_DAYS = 90; // used for curve indexing

    enum PoolKind { Pair, Single }

    struct Pool {
        PoolKind kind;
        IBurnable tokenA; // lock/burn token A (or single)
        IBurnable tokenB; // pair: lock/burn token B; single: zero
        IERC20 rewardA;   // pair: reward; single: reward A
        IERC20 rewardB;   // single: reward B; pair: zero
        bool exists;
    }

    struct Position {
        uint256 amount; // for pair: equal amount for A and B; for single: amount of A
        uint64 start;
        bool exists;
    }

    uint256 public poolCount;
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => Position)) public positions; // pid => user => pos
    // Exponential-like reward curve sampled per day from 0..90 (inclusive), scaled by 1e6.
    // curve[0] is the factor at day 0, curve[90] must be 1_000_000. Monotone non-decreasing.
    uint32[] public rewardCurve;

    event PoolAdded(uint256 indexed pid, PoolKind kind);
    event Staked(uint256 indexed pid, address indexed user, uint256 amount);
    event EarlyWithdraw(uint256 indexed pid, address indexed user, uint256 amount);
    event Claimed(uint256 indexed pid, address indexed user, uint256 amount);

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        // Default to a normalized sigmoid ramp curve y = (σ(t) - σ(0)) / (σ(90) - σ(0)) with k = 0.1, sampled per day.
        rewardCurve = new uint32[](LOCK_DAYS + 1);
        uint32[91] memory curve = [
            uint32(0),
            uint32(1167),
            uint32(2454),
            uint32(3872),
            uint32(5435),
            uint32(7157),
            uint32(9052),
            uint32(11139),
            uint32(13435),
            uint32(15961),
            uint32(18737),
            uint32(21787),
            uint32(25137),
            uint32(28812),
            uint32(32842),
            uint32(37258),
            uint32(42092),
            uint32(47378),
            uint32(53154),
            uint32(59458),
            uint32(66329),
            uint32(73808),
            uint32(81936),
            uint32(90758),
            uint32(100314),
            uint32(110647),
            uint32(121798),
            uint32(133804),
            uint32(146702),
            uint32(160522),
            uint32(175290),
            uint32(191027),
            uint32(207743),
            uint32(225442),
            uint32(244117),
            uint32(263750),
            uint32(284311),
            uint32(305757),
            uint32(328033),
            uint32(351071),
            uint32(374789),
            uint32(399095),
            uint32(423885),
            uint32(449046),
            uint32(474460),
            uint32(500000),
            uint32(525540),
            uint32(550954),
            uint32(576115),
            uint32(600905),
            uint32(625211),
            uint32(648929),
            uint32(671967),
            uint32(694243),
            uint32(715689),
            uint32(736250),
            uint32(755883),
            uint32(774558),
            uint32(792257),
            uint32(808973),
            uint32(824710),
            uint32(839478),
            uint32(853298),
            uint32(866196),
            uint32(878202),
            uint32(889353),
            uint32(899686),
            uint32(909242),
            uint32(918064),
            uint32(926192),
            uint32(933671),
            uint32(940542),
            uint32(946846),
            uint32(952622),
            uint32(957908),
            uint32(962742),
            uint32(967158),
            uint32(971188),
            uint32(974863),
            uint32(978213),
            uint32(981263),
            uint32(984039),
            uint32(986565),
            uint32(988861),
            uint32(990948),
            uint32(992843),
            uint32(994565),
            uint32(996128),
            uint32(997546),
            uint32(998833),
            uint32(1000000)
        ];
        for (uint256 d = 0; d <= LOCK_DAYS; d++) {
            rewardCurve[d] = curve[d];
        }
    }

    // Admin
    function addPairPool(IBurnable tokenA, IBurnable tokenB, IERC20 reward) external onlyOwner returns (uint256 pid) {
        require(address(tokenA) != address(0) && address(tokenB) != address(0), "tokens");
        require(address(reward) != address(0), "reward");
        pid = poolCount++;
        pools[pid] = Pool({kind: PoolKind.Pair, tokenA: tokenA, tokenB: tokenB, rewardA: reward, rewardB: IERC20(address(0)), exists: true});
        emit PoolAdded(pid, PoolKind.Pair);
    }

    function addSinglePool(IBurnable token, IERC20 rewardA, IERC20 rewardB) external onlyOwner returns (uint256 pid) {
        require(address(token) != address(0) && address(rewardA) != address(0) && address(rewardB) != address(0), "addr");
        pid = poolCount++;
        pools[pid] = Pool({kind: PoolKind.Single, tokenA: token, tokenB: IBurnable(address(0)), rewardA: rewardA, rewardB: rewardB, exists: true});
        emit PoolAdded(pid, PoolKind.Single);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // Owner: set exponential-like reward curve (91 points, day 0..90), scaled 1e6, last must be 1e6
    function setRewardCurve(uint32[] calldata curve) external onlyOwner {
        require(curve.length == LOCK_DAYS + 1, "len");
        require(curve[LOCK_DAYS] == 1_000_000, "end");
        for (uint256 i = 1; i < curve.length; i++) {
            require(curve[i] >= curve[i-1], "mono");
            require(curve[i] <= 1_000_000, "range");
        }
        delete rewardCurve;
        for (uint256 i = 0; i < curve.length; i++) rewardCurve.push(curve[i]);
    }

    // Funding helpers: operator can move reward tokens into the contract (approval required)
    function fundReward(uint256 pid, IERC20 token, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        Pool memory p = pools[pid];
        require(p.exists, "pool");
        require(amount > 0, "amount");
        // must match a reward token for this pool
        require(address(token) == address(p.rewardA) || (p.kind == PoolKind.Single && address(token) == address(p.rewardB)), "reward");
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    // View helpers
    function canClaim(uint256 pid, address user) public view returns (bool) {
        Position memory pos = positions[pid][user];
        return pos.exists && block.timestamp >= pos.start + LOCK_PERIOD;
    }

    // Staking (locking)
    function stakePair(uint256 pid, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount");
        Pool memory p = pools[pid];
        require(p.exists && p.kind == PoolKind.Pair, "pair");
        Position storage pos = positions[pid][msg.sender];
        require(!pos.exists, "active");
        // pull tokens
        IERC20 tokenA = IERC20(address(p.tokenA));
        IERC20 tokenB = IERC20(address(p.tokenB));
        tokenA.safeTransferFrom(msg.sender, address(this), amount);
        tokenB.safeTransferFrom(msg.sender, address(this), amount);
        positions[pid][msg.sender] = Position({amount: amount, start: uint64(block.timestamp), exists: true});
        emit Staked(pid, msg.sender, amount);
    }

    function stakeSingle(uint256 pid, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount");
        Pool memory p = pools[pid];
        require(p.exists && p.kind == PoolKind.Single, "single");
        Position storage pos = positions[pid][msg.sender];
        require(!pos.exists, "active");
        IERC20 tokenA = IERC20(address(p.tokenA));
        tokenA.safeTransferFrom(msg.sender, address(this), amount);
        positions[pid][msg.sender] = Position({amount: amount, start: uint64(block.timestamp), exists: true});
        emit Staked(pid, msg.sender, amount);
    }

    // Early exit: returns locked tokens; no rewards (optional escape hatch)
    function earlyWithdraw(uint256 pid) external nonReentrant whenNotPaused {
        Pool memory p = pools[pid];
        require(p.exists, "pool");
        Position storage pos = positions[pid][msg.sender];
        require(pos.exists, "no pos");
        uint256 amount = pos.amount;
        delete positions[pid][msg.sender];
        if (p.kind == PoolKind.Pair) {
            IERC20 tokenA = IERC20(address(p.tokenA));
            IERC20 tokenB = IERC20(address(p.tokenB));
            tokenA.safeTransfer(msg.sender, amount);
            tokenB.safeTransfer(msg.sender, amount);
        } else {
            IERC20 tokenA = IERC20(address(p.tokenA));
            tokenA.safeTransfer(msg.sender, amount);
        }
        emit EarlyWithdraw(pid, msg.sender, amount);
    }

    // Claim: burns locked tokens and pays rewards scaled by curve factor (full at >=90 days)
    function claim(uint256 pid) external nonReentrant whenNotPaused {
        Pool memory p = pools[pid];
        require(p.exists, "pool");
        Position storage pos = positions[pid][msg.sender];
        require(pos.exists, "no pos");
        uint256 amount = pos.amount;
        uint256 factor = _factor(pos.start, block.timestamp); // 0..1e6
        if (factor > 1_000_000) factor = 1_000_000;
        delete positions[pid][msg.sender];
        if (p.kind == PoolKind.Pair) {
            // burn locked tokens held by this contract
            p.tokenA.burn(amount);
            p.tokenB.burn(amount);
            // pay reward
            uint256 payout = (amount * factor) / 1_000_000;
            require(p.rewardA.balanceOf(address(this)) >= payout, "budget");
            if (payout > 0) p.rewardA.safeTransfer(msg.sender, payout);
        } else {
            p.tokenA.burn(amount);
            uint256 payout = (amount * factor) / 1_000_000;
            require(p.rewardA.balanceOf(address(this)) >= payout, "budgetA");
            require(p.rewardB.balanceOf(address(this)) >= payout, "budgetB");
            if (payout > 0) {
                p.rewardA.safeTransfer(msg.sender, payout);
                p.rewardB.safeTransfer(msg.sender, payout);
            }
        }
        emit Claimed(pid, msg.sender, amount);
    }

    function _factor(uint64 start, uint256 nowTs) internal view returns (uint256) {
        if (nowTs <= start) return rewardCurve[0];
        uint256 elapsed = nowTs - start;
        uint256 day = elapsed / 1 days;
        if (day >= LOCK_DAYS) return 1_000_000;
        return rewardCurve[day];
    }
}
