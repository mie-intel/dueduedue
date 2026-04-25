// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/QuestionPool.sol";

contract QuestionPoolTest is Test {
    QuestionPool pool;
    address admin = address(this);
    address verifier = address(0xAA);
    address gameContract = address(0xBB);
    address contributor = address(0xCC);
    address player = address(0xDD);

    function setUp() public {
        pool = QuestionPool(address(new ERC1967Proxy(
            address(new QuestionPool()),
            abi.encodeCall(QuestionPool.initialize, (admin))
        )));
        pool.grantRole(pool.VERIFIER_ROLE(), verifier);
        pool.grantRole(pool.GAME_ROLE(), gameContract);
    }

    function test_submitQuestion() public {
        vm.prank(contributor);
        uint256 id = pool.submitQuestion("Qm123");
        assertEq(id, 1);
        assertEq(pool.questionCount(), 1);

        (
            uint256 qId,
            address qContributor,
            string memory ipfsHash,
            bool isVerified,
            uint8 difficulty,
            ,

        ) = pool.questions(1);
        assertEq(qId, 1);
        assertEq(qContributor, contributor);
        assertEq(ipfsHash, "Qm123");
        assertFalse(isVerified);
        assertEq(difficulty, 0);
    }

    function test_submitQuestion_increments_contributor_list() public {
        vm.startPrank(contributor);
        pool.submitQuestion("Qm1");
        pool.submitQuestion("Qm2");
        vm.stopPrank();
        assertEq(pool.contributorQuestions(contributor, 0), 1);
        assertEq(pool.contributorQuestions(contributor, 1), 2);
    }

    function test_verifyQuestion() public {
        vm.prank(contributor);
        pool.submitQuestion("Qm123");

        vm.prank(verifier);
        pool.verifyQuestion(1, 2);

        (, , , bool isVerified, uint8 difficulty, , ) = pool.questions(1);
        assertTrue(isVerified);
        assertEq(difficulty, 2);
    }

    function test_verifyQuestion_revert_already_verified() public {
        vm.prank(contributor);
        pool.submitQuestion("Qm123");
        vm.prank(verifier);
        pool.verifyQuestion(1, 1);

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(QuestionPool.AlreadyVerified.selector, 1));
        pool.verifyQuestion(1, 2);
    }

    function test_verifyQuestion_revert_not_found() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(QuestionPool.QuestionNotFound.selector, 99));
        pool.verifyQuestion(99, 1);
    }

    function test_verifyQuestion_only_verifier_role() public {
        vm.prank(contributor);
        pool.submitQuestion("Qm123");

        vm.prank(player);
        vm.expectRevert();
        pool.verifyQuestion(1, 1);
    }

    function test_getVerifiedQuestions() public {
        vm.startPrank(contributor);
        pool.submitQuestion("Qm1");
        pool.submitQuestion("Qm2");
        pool.submitQuestion("Qm3");
        vm.stopPrank();

        vm.prank(verifier);
        pool.verifyQuestion(1, 1);
        vm.prank(verifier);
        pool.verifyQuestion(3, 2);

        uint256[] memory verified = pool.getVerifiedQuestions();
        assertEq(verified.length, 2);
        assertEq(verified[0], 1);
        assertEq(verified[1], 3);
    }

    function test_incrementDailyCount() public {
        assertEq(pool.getDailyCount(player), 0);

        vm.prank(gameContract);
        pool.incrementDailyCount(player);
        assertEq(pool.getDailyCount(player), 1);

        vm.prank(gameContract);
        pool.incrementDailyCount(player);
        assertEq(pool.getDailyCount(player), 2);
    }

    function test_incrementDailyCount_revert_limit_exceeded() public {
        vm.startPrank(gameContract);
        pool.incrementDailyCount(player);
        pool.incrementDailyCount(player);
        pool.incrementDailyCount(player);

        uint256 dayId = block.timestamp / 1 days;
        vm.expectRevert(
            abi.encodeWithSelector(QuestionPool.DailyLimitExceeded.selector, player, dayId)
        );
        pool.incrementDailyCount(player);
        vm.stopPrank();
    }

    function test_incrementDailyCount_resets_next_day() public {
        vm.startPrank(gameContract);
        pool.incrementDailyCount(player);
        pool.incrementDailyCount(player);
        pool.incrementDailyCount(player);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        vm.prank(gameContract);
        pool.incrementDailyCount(player);
        assertEq(pool.getDailyCount(player), 1);
    }

    function test_incrementDailyCount_only_game_role() public {
        vm.prank(player);
        vm.expectRevert();
        pool.incrementDailyCount(player);
    }

    function test_getRandomQuestions() public {
        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(contributor);
            pool.submitQuestion(string(abi.encodePacked("Qm", vm.toString(i))));
            vm.prank(verifier);
            pool.verifyQuestion(i, 1);
        }

        uint256[] memory result = pool.getRandomQuestions(3, 42);
        assertEq(result.length, 3);

        for (uint256 i = 0; i < result.length; i++) {
            assertTrue(result[i] >= 1 && result[i] <= 5);
        }

        for (uint256 i = 0; i < result.length; i++) {
            for (uint256 j = i + 1; j < result.length; j++) {
                assertTrue(result[i] != result[j]);
            }
        }
    }

    function test_getRandomQuestions_returns_all_if_count_gte_pool() public {
        vm.prank(contributor);
        pool.submitQuestion("Qm1");
        vm.prank(verifier);
        pool.verifyQuestion(1, 1);

        uint256[] memory result = pool.getRandomQuestions(10, 99);
        assertEq(result.length, 1);
    }

    function test_getRandomQuestions_empty_pool() public {
        uint256[] memory result = pool.getRandomQuestions(5, 0);
        assertEq(result.length, 0);
    }
}
