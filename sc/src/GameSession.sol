// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IQuestionPool.sol";
import "./interfaces/ICasualPool.sol";

/// @notice PvP 1v1 commit-reveal game session with wager escrow.
contract GameSession is AccessControlUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    enum Status {
        WAITING,
        PLAYING,
        COMMITTING,
        REVEALING,
        DONE
    }

    struct Session {
        bytes32 id;
        address player1;
        address player2;
        uint256 wager;
        uint256[10] questionIds;
        uint8 questionCount;
        bytes32 commitHash1;
        bytes32 commitHash2;
        uint8 score1;
        uint8 score2;
        Status status;
        uint256 playDeadline;
        uint256 revealDeadline;
    }

    IERC20 public paymentToken;
    address public treasury;
    IQuestionPool public questionPool;
    ICasualPool public casualPool;

    mapping(bytes32 => Session) public sessions;
    mapping(address => uint256) public pendingPvpPayout;

    uint256 public constant PLAY_WINDOW = 10 minutes;
    uint256 public constant REVEAL_WINDOW = 2 minutes;

    uint256 public constant WINNER_BPS = 8700;
    uint256 public constant CONTRIBUTOR_BPS = 1000;
    uint256 public constant TREASURY_BPS = 300;

    error SessionNotFound(bytes32 sessionId);
    error SessionFull(bytes32 sessionId);
    error NotPlayer(bytes32 sessionId, address caller);
    error WrongStatus(bytes32 sessionId, Status expected, Status actual);
    error DeadlineExceeded(bytes32 sessionId);
    error DeadlineNotReached(bytes32 sessionId);
    error AlreadyCommitted(address player);
    error InvalidReveal(address player);
    error NotBothCommitted(bytes32 sessionId);
    error NothingToWithdraw(address player);

    event SessionCreated(bytes32 indexed sessionId, address player1, uint256 wager);
    event PlayerJoined(bytes32 indexed sessionId, address player2);
    event AnswersCommitted(bytes32 indexed sessionId, address player);
    event AnswersRevealed(bytes32 indexed sessionId, address player, uint8 score);
    event SessionResolved(bytes32 indexed sessionId, address winner, uint256 payout);
    event SessionTied(bytes32 indexed sessionId, uint256 refundEach);
    event SessionRefunded(bytes32 indexed sessionId, address claimant, uint256 amount);
    event PvpPayoutAccumulated(address indexed player, uint256 amount);
    event PvpPayoutWithdrawn(address indexed player, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _treasury,
        address _paymentToken,
        address _questionPool,
        address _casualPool
    ) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
        treasury = _treasury;
        paymentToken = IERC20(_paymentToken);
        questionPool = IQuestionPool(_questionPool);
        casualPool = ICasualPool(_casualPool);
    }

    // ─── Session Creation ───────────────────────────────────────────────────────

    function createSession(uint256 wager, uint256[] calldata questionIdList, address payer)
        external
        nonReentrant
        returns (bytes32 sessionId)
    {
        require(questionIdList.length > 0 && questionIdList.length <= 10, "1-10 questions");

        // allow either the payer themselves, or a relayer authorized to act on
        // behalf of the payer (requires the payer to have approved the caller)
        if (payer == address(0)) payer = msg.sender;
        require(payer == msg.sender || hasRole(RELAYER_ROLE, msg.sender), "must be payer or relayer");

        paymentToken.safeTransferFrom(payer, address(this), wager);

        sessionId = keccak256(abi.encodePacked(payer, block.timestamp, wager));

        Session storage s = sessions[sessionId];
        s.id = sessionId;
        s.player1 = payer;
        s.wager = wager;
        s.status = Status.WAITING;
        s.playDeadline = block.timestamp + PLAY_WINDOW;
        s.questionCount = uint8(questionIdList.length);
        for (uint256 i = 0; i < questionIdList.length; i++) {
            s.questionIds[i] = questionIdList[i];
        }

        emit SessionCreated(sessionId, payer, wager);
    }

    function joinSession(bytes32 sessionId) external nonReentrant {
        Session storage s = _requireSession(sessionId);
        if (s.status != Status.WAITING) revert WrongStatus(sessionId, Status.WAITING, s.status);
        if (s.player2 != address(0)) revert SessionFull(sessionId);
        if (block.timestamp > s.playDeadline) revert DeadlineExceeded(sessionId);

        paymentToken.safeTransferFrom(msg.sender, address(this), s.wager);

        s.player2 = msg.sender;
        s.status = Status.PLAYING;

        emit PlayerJoined(sessionId, msg.sender);
    }

    // ─── Commit ─────────────────────────────────────────────────────────────────

    function commitAnswers(bytes32 sessionId, bytes32 commitHash) external nonReentrant {
        Session storage s = _requireSession(sessionId);
        if (s.status != Status.PLAYING && s.status != Status.COMMITTING) {
            revert WrongStatus(sessionId, Status.PLAYING, s.status);
        }
        if (block.timestamp > s.playDeadline) revert DeadlineExceeded(sessionId);

        bool isP1 = msg.sender == s.player1;
        bool isP2 = msg.sender == s.player2;
        if (!isP1 && !isP2) revert NotPlayer(sessionId, msg.sender);

        if (isP1) {
            if (s.commitHash1 != bytes32(0)) revert AlreadyCommitted(msg.sender);
            s.commitHash1 = commitHash;
        } else {
            if (s.commitHash2 != bytes32(0)) revert AlreadyCommitted(msg.sender);
            s.commitHash2 = commitHash;
        }

        emit AnswersCommitted(sessionId, msg.sender);

        if (s.commitHash1 != bytes32(0) && s.commitHash2 != bytes32(0)) {
            s.status = Status.REVEALING;
            s.revealDeadline = block.timestamp + REVEAL_WINDOW;
        } else {
            s.status = Status.COMMITTING;
        }
    }

    // ─── Reveal ─────────────────────────────────────────────────────────────────

    function revealAnswers(bytes32 sessionId, string[] calldata answers, bytes32 salt) external nonReentrant {
        Session storage s = _requireSession(sessionId);
        if (s.status != Status.REVEALING) revert WrongStatus(sessionId, Status.REVEALING, s.status);
        if (block.timestamp > s.revealDeadline) revert DeadlineExceeded(sessionId);

        bool isP1 = msg.sender == s.player1;
        bool isP2 = msg.sender == s.player2;
        if (!isP1 && !isP2) revert NotPlayer(sessionId, msg.sender);

        if (isP1) {
            if (s.commitHash1 == bytes32(uint256(1))) revert AlreadyCommitted(msg.sender);
            bytes32 expected = keccak256(abi.encodePacked(_joinAnswers(answers), salt));
            if (expected != s.commitHash1) revert InvalidReveal(msg.sender);
            s.score1 = _countNonEmpty(answers, s.questionCount);
            s.commitHash1 = bytes32(uint256(1));
        } else {
            if (s.commitHash2 == bytes32(uint256(1))) revert AlreadyCommitted(msg.sender);
            bytes32 expected = keccak256(abi.encodePacked(_joinAnswers(answers), salt));
            if (expected != s.commitHash2) revert InvalidReveal(msg.sender);
            s.score2 = _countNonEmpty(answers, s.questionCount);
            s.commitHash2 = bytes32(uint256(1));
        }

        uint8 score = isP1 ? s.score1 : s.score2;
        emit AnswersRevealed(sessionId, msg.sender, score);

        if (s.commitHash1 == bytes32(uint256(1)) && s.commitHash2 == bytes32(uint256(1))) {
            _resolveSession(sessionId, s);
        }
    }

    // ─── Resolve ────────────────────────────────────────────────────────────────

    function _resolveSession(bytes32 sessionId, Session storage s) internal {
        address winner = address(0);
        if (s.score1 > s.score2) {
            winner = s.player1;
        } else if (s.score2 > s.score1) {
            winner = s.player2;
        }
        _finalizeSession(sessionId, s, winner);
    }

    function resolveByRelayer(bytes32 sessionId, address winner, uint8 score1, uint8 score2)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
    {
        Session storage s = _requireSession(sessionId);
        if (s.status == Status.DONE) revert WrongStatus(sessionId, Status.PLAYING, s.status);
        if (s.player2 == address(0)) revert SessionFull(sessionId);
        if (winner != address(0) && winner != s.player1 && winner != s.player2) {
            revert NotPlayer(sessionId, winner);
        }

        s.score1 = score1;
        s.score2 = score2;

        _finalizeSession(sessionId, s, winner);
    }

    function _finalizeSession(bytes32 sessionId, Session storage s, address winner) internal {
        s.status = Status.DONE;

        uint256 pool = s.wager * 2;
        uint256 winnerPayout = (pool * WINNER_BPS) / 10000;
        uint256 contributorShare = (pool * CONTRIBUTOR_BPS) / 10000;
        uint256 treasuryShare = pool - winnerPayout - contributorShare;

        _distributeContributorShare(s, contributorShare);

        paymentToken.safeTransfer(treasury, treasuryShare);

        if (winner == s.player1) {
            _creditPvpPayout(s.player1, winnerPayout);
            emit SessionResolved(sessionId, s.player1, winnerPayout);
        } else if (winner == s.player2) {
            _creditPvpPayout(s.player2, winnerPayout);
            emit SessionResolved(sessionId, s.player2, winnerPayout);
        } else {
            uint256 refundEach = winnerPayout / 2;
            paymentToken.safeTransfer(s.player1, refundEach);
            paymentToken.safeTransfer(s.player2, refundEach);
            emit SessionTied(sessionId, refundEach);
        }
    }

    function _distributeContributorShare(Session storage s, uint256 total) internal {
        uint8 count = s.questionCount;
        if (count == 0) {
            paymentToken.safeTransfer(treasury, total);
            return;
        }
        // Distribute `total` across `count` questions fairly while preserving
        // the full total (avoid sending everything to treasury due to rounding).
        uint256 base = total / count;
        uint256 rem = total % count;

        uint256 creditedToCasual = 0;

        for (uint256 i = 0; i < count; i++) {
            (, address contributor,,,,,) = questionPool.questions(s.questionIds[i]);
            if (contributor == address(0)) {
                // If no contributor registered for this question, skip (amount goes to treasury later)
                continue;
            }

            // allocate an extra unit from the remainder to the first `rem` contributors
            uint256 amount = base + (i < rem ? 1 : 0);
            if (amount == 0) continue;

            casualPool.accumulateRoyalty(contributor, amount);
            creditedToCasual += amount;
        }

        // anything not credited (unregistered questions or skipped zeros) goes to treasury
        if (creditedToCasual > 0) {
            paymentToken.safeTransfer(address(casualPool), creditedToCasual);
        }
        if (creditedToCasual < total) {
            paymentToken.safeTransfer(treasury, total - creditedToCasual);
        }
    }

    // ─── Timeout Claims ─────────────────────────────────────────────────────────

    function claimTimeout(bytes32 sessionId) external nonReentrant {
        Session storage s = _requireSession(sessionId);
        if (s.status == Status.DONE) revert WrongStatus(sessionId, Status.DONE, s.status);

        bool isP1 = msg.sender == s.player1;
        bool isP2 = msg.sender == s.player2;
        if (!isP1 && !isP2) revert NotPlayer(sessionId, msg.sender);

        if (s.status == Status.WAITING) {
            if (block.timestamp <= s.playDeadline) revert DeadlineNotReached(sessionId);
            if (!isP1) revert NotPlayer(sessionId, msg.sender);
            s.status = Status.DONE;
            paymentToken.safeTransfer(s.player1, s.wager);
            emit SessionRefunded(sessionId, s.player1, s.wager);
            return;
        }

        if (s.status == Status.PLAYING || s.status == Status.COMMITTING) {
            if (block.timestamp <= s.playDeadline) revert DeadlineNotReached(sessionId);
            bool callerCommitted = isP1 ? s.commitHash1 != bytes32(0) : s.commitHash2 != bytes32(0);
            if (!callerCommitted) revert NotPlayer(sessionId, msg.sender);
            s.status = Status.DONE;
            uint256 pool = s.wager * 2;
            uint256 callerPayout = (pool * WINNER_BPS) / 10000;
            uint256 contributorShare = (pool * CONTRIBUTOR_BPS) / 10000;
            uint256 treasuryShare = pool - callerPayout - contributorShare;
            _distributeContributorShare(s, contributorShare);
            paymentToken.safeTransfer(treasury, treasuryShare);
            _creditPvpPayout(msg.sender, callerPayout);
            emit SessionRefunded(sessionId, msg.sender, callerPayout);
            return;
        }

        if (s.status == Status.REVEALING) {
            if (block.timestamp <= s.revealDeadline) revert DeadlineNotReached(sessionId);
            bool callerRevealed = isP1 ? s.commitHash1 == bytes32(uint256(1)) : s.commitHash2 == bytes32(uint256(1));
            if (!callerRevealed) revert NotPlayer(sessionId, msg.sender);
            s.status = Status.DONE;
            uint256 pool = s.wager * 2;
            uint256 callerPayout = (pool * WINNER_BPS) / 10000;
            uint256 contributorShare = (pool * CONTRIBUTOR_BPS) / 10000;
            uint256 treasuryShare = pool - callerPayout - contributorShare;
            _distributeContributorShare(s, contributorShare);
            paymentToken.safeTransfer(treasury, treasuryShare);
            _creditPvpPayout(msg.sender, callerPayout);
            emit SessionRefunded(sessionId, msg.sender, callerPayout);
            return;
        }
    }

    function withdrawPvpPayout() external nonReentrant {
        uint256 amount = pendingPvpPayout[msg.sender];
        if (amount == 0) revert NothingToWithdraw(msg.sender);
        pendingPvpPayout[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);
        emit PvpPayoutWithdrawn(msg.sender, amount);
    }

    // ─── View Helpers ────────────────────────────────────────────────────────────

    function getSession(bytes32 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }

    function getQuestionIds(bytes32 sessionId) external view returns (uint256[10] memory) {
        return sessions[sessionId].questionIds;
    }

    // ─── Internal Helpers ────────────────────────────────────────────────────────

    function _requireSession(bytes32 sessionId) internal view returns (Session storage s) {
        s = sessions[sessionId];
        if (s.player1 == address(0)) revert SessionNotFound(sessionId);
    }

    function _joinAnswers(string[] calldata answers) internal pure returns (bytes memory result) {
        for (uint256 i = 0; i < answers.length; i++) {
            result = abi.encodePacked(result, answers[i]);
        }
    }

    function _countNonEmpty(string[] calldata answers, uint8 maxCount) internal pure returns (uint8 score) {
        uint256 limit = answers.length < maxCount ? answers.length : maxCount;
        for (uint256 i = 0; i < limit; i++) {
            if (bytes(answers[i]).length > 0) score++;
        }
    }

    function _creditPvpPayout(address player, uint256 amount) internal {
        pendingPvpPayout[player] += amount;
        emit PvpPayoutAccumulated(player, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
