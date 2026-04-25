// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Registry for picture-guessing questions. Stores IPFS hashes on-chain.
contract QuestionPool is AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");

    struct Question {
        uint256 id;
        address contributor;
        string ipfsHash;
        bool isVerified;
        uint8 difficulty; // 1=easy 2=medium 3=hard
        uint256 timesPlayed;
        uint256 royaltyEarned;
    }

    uint256 public questionCount;
    mapping(uint256 => Question) public questions;
    mapping(address => uint256[]) public contributorQuestions;
    // wallet => dayId => count
    mapping(address => mapping(uint256 => uint8)) public dailyPlayCount;
    // flat list of all verified question IDs
    uint256[] private verifiedIds;

    uint8 public constant DAILY_FREE_LIMIT = 3;

    error AlreadyVerified(uint256 questionId);
    error NotVerified(uint256 questionId);
    error DailyLimitExceeded(address wallet, uint256 dayId);
    error QuestionNotFound(uint256 questionId);

    event QuestionSubmitted(uint256 indexed id, address indexed contributor);
    event QuestionVerified(uint256 indexed id, uint8 difficulty);
    event DailyCountIncremented(address indexed wallet, uint256 dayId, uint8 count);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    function submitQuestion(string calldata ipfsHash)
        external
        returns (uint256 id)
    {
        id = ++questionCount;
        questions[id] = Question({
            id: id,
            contributor: msg.sender,
            ipfsHash: ipfsHash,
            isVerified: false,
            difficulty: 0,
            timesPlayed: 0,
            royaltyEarned: 0
        });
        contributorQuestions[msg.sender].push(id);
        emit QuestionSubmitted(id, msg.sender);
    }

    function verifyQuestion(uint256 id, uint8 difficulty)
        external
        onlyRole(VERIFIER_ROLE)
    {
        if (id == 0 || id > questionCount) revert QuestionNotFound(id);
        Question storage q = questions[id];
        if (q.isVerified) revert AlreadyVerified(id);
        q.isVerified = true;
        q.difficulty = difficulty;
        verifiedIds.push(id);
        emit QuestionVerified(id, difficulty);
    }

    function incrementDailyCount(address wallet) external onlyRole(GAME_ROLE) {
        uint256 dayId = block.timestamp / 1 days;
        uint8 current = dailyPlayCount[wallet][dayId];
        if (current >= DAILY_FREE_LIMIT) revert DailyLimitExceeded(wallet, dayId);
        unchecked {
            dailyPlayCount[wallet][dayId] = current + 1;
        }
        emit DailyCountIncremented(wallet, dayId, current + 1);
    }

    function getDailyCount(address wallet) external view returns (uint8) {
        uint256 dayId = block.timestamp / 1 days;
        return dailyPlayCount[wallet][dayId];
    }

    function getVerifiedQuestions() external view returns (uint256[] memory) {
        return verifiedIds;
    }

    function getRandomQuestions(uint256 count, uint256 seed)
        external
        view
        returns (uint256[] memory result)
    {
        uint256 poolLen = verifiedIds.length;
        if (poolLen == 0 || count == 0) return result;
        if (count >= poolLen) return verifiedIds;

        result = new uint256[](count);
        uint256[] memory indices = new uint256[](poolLen);
        for (uint256 i = 0; i < poolLen; i++) indices[i] = i;

        for (uint256 i = 0; i < count; i++) {
            uint256 j = i + (uint256(keccak256(abi.encodePacked(seed, i))) % (poolLen - i));
            (indices[i], indices[j]) = (indices[j], indices[i]);
            result[i] = verifiedIds[indices[i]];
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
