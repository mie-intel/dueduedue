// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/GameSession.sol";
import "../src/QuestionPool.sol";
import "../src/MockUSD.sol";
import "../src/CasualPool.sol";

contract GameSessionTest is Test {
    GameSession game;
    QuestionPool pool;
    MockUSD token;
    CasualPool casual;

    address admin = address(this);
    address treasury = address(0xBEEF);
    address p1 = address(0x1111);
    address p2 = address(0x2222);
    address outsider = address(0x9999);
    address contrib = address(0xCC);

    uint256 constant WAGER = 1 ether;
    bytes32 REVEALED = bytes32(uint256(1));

    // helpers
    function _buildCommit(string[] memory answers, bytes32 salt) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < answers.length; i++) {
            packed = abi.encodePacked(packed, answers[i]);
        }
        return keccak256(abi.encodePacked(packed, salt));
    }

    function _defaultQuestions() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
    }

    function _setupSession() internal returns (bytes32 sessionId) {
        vm.prank(p1);
        sessionId = game.createSession(WAGER, _defaultQuestions(), p1);
        vm.prank(p2);
        game.joinSession(sessionId);
    }

    function setUp() public {
        token = MockUSD(address(new ERC1967Proxy(address(new MockUSD()), abi.encodeCall(MockUSD.initialize, ()))));

        pool = QuestionPool(
            address(new ERC1967Proxy(address(new QuestionPool()), abi.encodeCall(QuestionPool.initialize, (admin))))
        );

        // Submit + verify 3 questions
        vm.startPrank(contrib);
        pool.submitQuestion("Qm1");
        pool.submitQuestion("Qm2");
        pool.submitQuestion("Qm3");
        vm.stopPrank();
        pool.verifyQuestion(1, 1);
        pool.verifyQuestion(2, 1);
        pool.verifyQuestion(3, 1);

        casual = CasualPool(
            address(
                new ERC1967Proxy(
                    address(new CasualPool()),
                    abi.encodeCall(CasualPool.initialize, (admin, treasury, address(token), address(pool)))
                )
            )
        );

        game = GameSession(
            address(
                new ERC1967Proxy(
                    address(new GameSession()),
                    abi.encodeCall(
                        GameSession.initialize, (admin, treasury, address(token), address(pool), address(casual))
                    )
                )
            )
        );

        // grant GAME_ROLE on CasualPool to GameSession so it can accumulate royalties
        bytes32 gameRole = keccak256("GAME_ROLE");
        casual.grantRole(gameRole, address(game));

        // Fund players
        token.mint(p1, 100 ether);
        token.mint(p2, 100 ether);
        vm.prank(p1);
        token.approve(address(game), type(uint256).max);
        vm.prank(p2);
        token.approve(address(game), type(uint256).max);
    }

    function test_createSession() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);

        GameSession.Session memory s = game.getSession(sid);
        assertEq(s.player1, p1);
        assertEq(uint256(s.status), uint256(GameSession.Status.WAITING));
        assertEq(s.wager, WAGER);
        assertEq(token.balanceOf(address(game)), WAGER);
    }

    function test_createSession_revert_empty_questions() public {
        uint256[] memory empty = new uint256[](0);
        vm.prank(p1);
        vm.expectRevert("1-10 questions");
        game.createSession(WAGER, empty, p1);
    }

    function test_createSession_revert_too_many_questions() public {
        uint256[] memory tooMany = new uint256[](11);
        vm.prank(p1);
        vm.expectRevert("1-10 questions");
        game.createSession(WAGER, tooMany, p1);
    }

    // ─── joinSession ────────────────────────────────────────────────────────────

    function test_joinSession() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);

        vm.prank(p2);
        game.joinSession(sid);

        GameSession.Session memory s = game.getSession(sid);
        assertEq(s.player2, p2);
        assertEq(uint256(s.status), uint256(GameSession.Status.PLAYING));
        assertEq(token.balanceOf(address(game)), WAGER * 2);
    }

    function test_joinSession_revert_already_full() public {
        bytes32 sid = _setupSession();
        address p3 = address(0x3333);
        token.mint(p3, 100 ether);
        vm.prank(p3);
        token.approve(address(game), type(uint256).max);

        vm.prank(p3);
        // Status is PLAYING after p2 joined — WrongStatus fires before SessionFull check
        vm.expectRevert(
            abi.encodeWithSelector(
                GameSession.WrongStatus.selector, sid, GameSession.Status.WAITING, GameSession.Status.PLAYING
            )
        );
        game.joinSession(sid);
    }

    function test_joinSession_revert_past_deadline() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);

        vm.warp(block.timestamp + 11 minutes);
        vm.prank(p2);
        vm.expectRevert(abi.encodeWithSelector(GameSession.DeadlineExceeded.selector, sid));
        game.joinSession(sid);
    }

    // ─── commitAnswers ──────────────────────────────────────────────────────────

    function test_commitAnswers_both_players() public {
        bytes32 sid = _setupSession();

        string[] memory a1 = new string[](3);
        a1[0] = "cat";
        a1[1] = "dog";
        a1[2] = "fish";
        bytes32 salt1 = bytes32(uint256(111));

        string[] memory a2 = new string[](3);
        a2[0] = "cat";
        a2[1] = "bird";
        a2[2] = "fish";
        bytes32 salt2 = bytes32(uint256(222));

        vm.prank(p1);
        game.commitAnswers(sid, _buildCommit(a1, salt1));

        GameSession.Session memory s1 = game.getSession(sid);
        assertEq(uint256(s1.status), uint256(GameSession.Status.COMMITTING));

        vm.prank(p2);
        game.commitAnswers(sid, _buildCommit(a2, salt2));

        GameSession.Session memory s2 = game.getSession(sid);
        assertEq(uint256(s2.status), uint256(GameSession.Status.REVEALING));
    }

    function test_commitAnswers_revert_double_commit() public {
        bytes32 sid = _setupSession();
        bytes32 hash = keccak256("test");

        vm.prank(p1);
        game.commitAnswers(sid, hash);

        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.AlreadyCommitted.selector, p1));
        game.commitAnswers(sid, hash);
    }

    function test_commitAnswers_revert_outsider() public {
        bytes32 sid = _setupSession();
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(GameSession.NotPlayer.selector, sid, outsider));
        game.commitAnswers(sid, keccak256("x"));
    }

    function test_commitAnswers_revert_past_deadline() public {
        bytes32 sid = _setupSession();
        vm.warp(block.timestamp + 11 minutes);

        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.DeadlineExceeded.selector, sid));
        game.commitAnswers(sid, keccak256("x"));
    }

    // ─── revealAnswers ──────────────────────────────────────────────────────────

    function _commitBoth(bytes32 sid, string[] memory a1, bytes32 salt1, string[] memory a2, bytes32 salt2) internal {
        vm.prank(p1);
        game.commitAnswers(sid, _buildCommit(a1, salt1));
        vm.prank(p2);
        game.commitAnswers(sid, _buildCommit(a2, salt2));
    }

    function test_revealAnswers_p1_wins() public {
        bytes32 sid = _setupSession();

        string[] memory a1 = new string[](3);
        a1[0] = "cat"; // 3 correct (non-empty)
        a1[1] = "dog";
        a1[2] = "fish";
        bytes32 salt1 = bytes32(uint256(111));

        string[] memory a2 = new string[](3);
        a2[0] = "cat"; // 2 non-empty
        a2[1] = "";
        a2[2] = "fish";
        bytes32 salt2 = bytes32(uint256(222));

        _commitBoth(sid, a1, salt1, a2, salt2);

        uint256 p1Before = token.balanceOf(p1);
        uint256 p2Before = token.balanceOf(p2);

        vm.prank(p1);
        game.revealAnswers(sid, a1, salt1);
        vm.prank(p2);
        game.revealAnswers(sid, a2, salt2);

        GameSession.Session memory s = game.getSession(sid);
        assertEq(uint256(s.status), uint256(GameSession.Status.DONE));
        assertEq(s.score1, 3);
        assertEq(s.score2, 2);

        // p1 should receive withdrawable winner payout (87% of 2 ether = 1.74 ether)
        uint256 expectedPayout = (WAGER * 2 * 8700) / 10000;
        assertEq(token.balanceOf(p1), p1Before);
        assertEq(game.pendingPvpPayout(p1), expectedPayout);
        // p2 gets nothing from pool
        assertEq(token.balanceOf(p2), p2Before);

        vm.prank(p1);
        game.withdrawPvpPayout();
        assertEq(token.balanceOf(p1), p1Before + expectedPayout);
        assertEq(game.pendingPvpPayout(p1), 0);
    }

    function test_revealAnswers_p2_wins() public {
        bytes32 sid = _setupSession();

        string[] memory a1 = new string[](3);
        a1[0] = "cat";
        a1[1] = "";
        a1[2] = "";
        bytes32 salt1 = bytes32(uint256(111));

        string[] memory a2 = new string[](3);
        a2[0] = "cat";
        a2[1] = "dog";
        a2[2] = "fish";
        bytes32 salt2 = bytes32(uint256(222));

        _commitBoth(sid, a1, salt1, a2, salt2);

        vm.prank(p1);
        game.revealAnswers(sid, a1, salt1);
        vm.prank(p2);
        game.revealAnswers(sid, a2, salt2);

        GameSession.Session memory s = game.getSession(sid);
        assertEq(s.score2, 3);
        assertTrue(s.score2 > s.score1);
        assertEq(game.pendingPvpPayout(p2), (WAGER * 2 * 8700) / 10000);
    }

    function test_revealAnswers_tie() public {
        bytes32 sid = _setupSession();

        string[] memory a1 = new string[](3);
        a1[0] = "cat";
        a1[1] = "dog";
        a1[2] = "fish";
        bytes32 salt1 = bytes32(uint256(111));

        string[] memory a2 = new string[](3);
        a2[0] = "cat";
        a2[1] = "dog";
        a2[2] = "fish";
        bytes32 salt2 = bytes32(uint256(222));

        _commitBoth(sid, a1, salt1, a2, salt2);

        uint256 p1Before = token.balanceOf(p1);
        uint256 p2Before = token.balanceOf(p2);

        vm.prank(p1);
        game.revealAnswers(sid, a1, salt1);
        vm.prank(p2);
        game.revealAnswers(sid, a2, salt2);

        uint256 expectedEach = (WAGER * 2 * 8700) / 10000 / 2;
        assertEq(token.balanceOf(p1), p1Before + expectedEach);
        assertEq(token.balanceOf(p2), p2Before + expectedEach);
        assertEq(game.pendingPvpPayout(p1), 0);
        assertEq(game.pendingPvpPayout(p2), 0);
    }

    function test_withdrawPvpPayout_revert_nothing() public {
        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.NothingToWithdraw.selector, p1));
        game.withdrawPvpPayout();
    }

    function test_revealAnswers_revert_invalid_hash() public {
        bytes32 sid = _setupSession();

        string[] memory a1 = new string[](3);
        a1[0] = "cat";
        a1[1] = "dog";
        a1[2] = "fish";
        bytes32 salt1 = bytes32(uint256(111));

        string[] memory wrong = new string[](3);
        wrong[0] = "WRONG";
        wrong[1] = "WRONG";
        wrong[2] = "WRONG";

        _commitBoth(sid, a1, salt1, a1, salt1);

        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.InvalidReveal.selector, p1));
        game.revealAnswers(sid, wrong, salt1);
    }

    function test_revealAnswers_revert_past_deadline() public {
        bytes32 sid = _setupSession();

        string[] memory a = new string[](1);
        a[0] = "cat";
        bytes32 salt = bytes32(uint256(1));

        _commitBoth(sid, a, salt, a, salt);

        vm.warp(block.timestamp + 3 minutes);
        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.DeadlineExceeded.selector, sid));
        game.revealAnswers(sid, a, salt);
    }

    // ─── claimTimeout ───────────────────────────────────────────────────────────

    function test_claimTimeout_p2_never_joined() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);

        uint256 p1Before = token.balanceOf(p1);
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(p1);
        game.claimTimeout(sid);

        assertEq(token.balanceOf(p1), p1Before + WAGER);
        assertEq(uint256(game.getSession(sid).status), uint256(GameSession.Status.DONE));
    }

    function test_claimTimeout_opponent_no_commit() public {
        bytes32 sid = _setupSession();

        string[] memory a = new string[](3);
        a[0] = "cat";
        a[1] = "dog";
        a[2] = "fish";
        bytes32 salt = bytes32(uint256(1));

        vm.prank(p1);
        game.commitAnswers(sid, _buildCommit(a, salt));
        // p2 never commits

        uint256 p1Before = token.balanceOf(p1);
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(p1);
        game.claimTimeout(sid);

        assertEq(uint256(game.getSession(sid).status), uint256(GameSession.Status.DONE));
        uint256 expectedPayout = (WAGER * 2 * 8700) / 10000;
        assertEq(token.balanceOf(p1), p1Before);
        assertEq(game.pendingPvpPayout(p1), expectedPayout);

        vm.prank(p1);
        game.withdrawPvpPayout();
        assertEq(token.balanceOf(p1), p1Before + expectedPayout);
    }

    function test_claimTimeout_opponent_no_reveal() public {
        bytes32 sid = _setupSession();

        string[] memory a = new string[](3);
        a[0] = "cat";
        a[1] = "dog";
        a[2] = "fish";
        bytes32 salt = bytes32(uint256(1));

        _commitBoth(sid, a, salt, a, salt);
        // p1 reveals, p2 does not
        vm.prank(p1);
        game.revealAnswers(sid, a, salt);

        uint256 p1Before = token.balanceOf(p1);
        vm.warp(block.timestamp + 3 minutes);
        vm.prank(p1);
        game.claimTimeout(sid);

        assertEq(uint256(game.getSession(sid).status), uint256(GameSession.Status.DONE));
        uint256 expectedPayout = (WAGER * 2 * 8700) / 10000;
        assertEq(token.balanceOf(p1), p1Before);
        assertEq(game.pendingPvpPayout(p1), expectedPayout);
    }

    function test_claimTimeout_revert_deadline_not_reached() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);

        vm.prank(p1);
        vm.expectRevert(abi.encodeWithSelector(GameSession.DeadlineNotReached.selector, sid));
        game.claimTimeout(sid);
    }

    function test_claimTimeout_revert_outsider() public {
        vm.prank(p1);
        bytes32 sid = game.createSession(WAGER, _defaultQuestions(), p1);
        vm.warp(block.timestamp + 11 minutes);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(GameSession.NotPlayer.selector, sid, outsider));
        game.claimTimeout(sid);
    }

    // ─── treasury + contributor distribution ────────────────────────────────────

    function test_treasury_receives_correct_share() public {
        bytes32 sid = _setupSession();

        string[] memory a = new string[](3);
        a[0] = "cat";
        a[1] = "dog";
        a[2] = "fish";
        bytes32 salt1 = bytes32(uint256(1));
        bytes32 salt2 = bytes32(uint256(2));

        _commitBoth(sid, a, salt1, a, salt2);

        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.prank(p1);
        game.revealAnswers(sid, a, salt1);
        vm.prank(p2);
        game.revealAnswers(sid, a, salt2);

        uint256 poolAmount = WAGER * 2;
        uint256 expectedTreasury = (poolAmount * 300) / 10000; // 3%
        uint256 expectedContributor = (poolAmount * 1000) / 10000; // 10%
        assertEq(token.balanceOf(treasury), treasuryBefore + expectedTreasury);
        assertEq(casual.pendingRoyalty(contrib), expectedContributor);
        assertEq(token.balanceOf(address(casual)), expectedContributor);
    }
}
