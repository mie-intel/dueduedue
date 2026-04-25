// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IQuestionPool.sol";

/// @notice Handles paid casual game fees. 90% → contributors, 10% → treasury.
contract CasualPool is AccessControlUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");

    IERC20 public paymentToken;
    address public treasury;
    IQuestionPool public questionPool;

    mapping(address => uint256) public pendingRoyalty;

    uint256 public constant FEE_AMOUNT = 50_000; // Rp 500 in IDRX (2 decimals)
    uint256 public constant CONTRIBUTOR_BPS = 9000;
    uint256 public constant TREASURY_BPS = 1000;

    error NothingToWithdraw(address contributor);
    error InvalidQuestionIds();

    event CasualFeePaid(address indexed player, uint256 amount, uint256[] questionIds);
    event RoyaltyAccumulated(address indexed contributor, uint256 amount);
    event RoyaltyWithdrawn(address indexed contributor, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _treasury, address _paymentToken, address _questionPool) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        treasury = _treasury;
        paymentToken = IERC20(_paymentToken);
        questionPool = IQuestionPool(_questionPool);
    }

    function payAndPlay(uint256[] calldata questionIds) external nonReentrant {
        if (questionIds.length == 0) revert InvalidQuestionIds();

        paymentToken.safeTransferFrom(msg.sender, address(this), FEE_AMOUNT);

        uint256 totalForContributors = (FEE_AMOUNT * CONTRIBUTOR_BPS) / 10000;
        uint256 forTreasury = FEE_AMOUNT - totalForContributors;
        uint256 perQuestion = totalForContributors / questionIds.length;
        uint256 distributed = 0;

        for (uint256 i = 0; i < questionIds.length; i++) {
            (, address contrib, , , , , ) = questionPool.questions(questionIds[i]);
            if (contrib != address(0)) {
                pendingRoyalty[contrib] += perQuestion;
                distributed += perQuestion;
                emit RoyaltyAccumulated(contrib, perQuestion);
            }
        }

        uint256 dust = totalForContributors - distributed;
        paymentToken.safeTransfer(treasury, forTreasury + dust);

        emit CasualFeePaid(msg.sender, FEE_AMOUNT, questionIds);
    }

    /// @notice Called by game contracts to credit pending royalties for contributors.
    /// The caller must be granted `GAME_ROLE` on this contract. The contract must hold
    /// sufficient token balance for subsequent withdrawals.
    function accumulateRoyalty(address contributor, uint256 amount) external onlyRole(GAME_ROLE) {
        if (amount == 0) return;
        pendingRoyalty[contributor] += amount;
        emit RoyaltyAccumulated(contributor, amount);
    }

    function withdrawRoyalty() external nonReentrant {
        uint256 amount = pendingRoyalty[msg.sender];
        if (amount == 0) revert NothingToWithdraw(msg.sender);
        pendingRoyalty[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);
        emit RoyaltyWithdrawn(msg.sender, amount);
    }

    function distributeRoyalties(address[] calldata contributors) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < contributors.length; i++) {
            address contrib = contributors[i];
            uint256 amount = pendingRoyalty[contrib];
            if (amount == 0) continue;
            pendingRoyalty[contrib] = 0;
            paymentToken.safeTransfer(contrib, amount);
            emit RoyaltyWithdrawn(contrib, amount);
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
