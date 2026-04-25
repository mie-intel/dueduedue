// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/CasualPool.sol";
import "../src/MockUSD.sol";
import "../src/interfaces/IQuestionPool.sol";

contract MockQuestionPool {
    mapping(uint256 => address) public contributors;

    function setContributor(uint256 id, address c) external {
        contributors[id] = c;
    }

    function questions(uint256 id)
        external
        view
        returns (
            uint256 qId,
            address contributor,
            string memory ipfsHash,
            bool isVerified,
            uint8 difficulty,
            uint256 timesPlayed,
            uint256 royaltyEarned
        )
    {
        return (id, contributors[id], "", false, 0, 0, 0);
    }
}

contract CasualPoolTest is Test {
    CasualPool pool;
    MockUSD token;
    MockQuestionPool mockQP;

    address admin = address(this);
    address treasury = address(0xBEEF);
    address player = address(0x1);
    address contrib1 = address(0xC1);
    address contrib2 = address(0xC2);

    uint256 constant FEE = 50_000; // Rp 500 in IDRX (2 decimals)

    function setUp() public {
        token = MockUSD(address(new ERC1967Proxy(
            address(new MockUSD()),
            abi.encodeCall(MockUSD.initialize, ())
        )));

        mockQP = new MockQuestionPool();
        mockQP.setContributor(1, contrib1);
        mockQP.setContributor(2, contrib1);
        mockQP.setContributor(3, contrib2);

        pool = CasualPool(address(new ERC1967Proxy(
            address(new CasualPool()),
            abi.encodeCall(CasualPool.initialize, (admin, treasury, address(token), address(mockQP)))
        )));

        token.mint(player, 10 ether);
        vm.prank(player);
        token.approve(address(pool), type(uint256).max);
    }

    function test_payAndPlay_basic() public {
        uint256[] memory qIds = new uint256[](2);
        qIds[0] = 1;
        qIds[1] = 2;

        vm.prank(player);
        pool.payAndPlay(qIds);

        // Both questions belong to contrib1
        uint256 totalContrib = (FEE * 9000) / 10000;
        uint256 perQ = totalContrib / 2;
        assertEq(pool.pendingRoyalty(contrib1), perQ * 2);
        assertGt(token.balanceOf(treasury), 0);
    }

    function test_payAndPlay_multiple_contributors() public {
        uint256[] memory qIds = new uint256[](2);
        qIds[0] = 1; // contrib1
        qIds[1] = 3; // contrib2

        vm.prank(player);
        pool.payAndPlay(qIds);

        uint256 totalContrib = (FEE * 9000) / 10000;
        uint256 perQ = totalContrib / 2;
        assertEq(pool.pendingRoyalty(contrib1), perQ);
        assertEq(pool.pendingRoyalty(contrib2), perQ);
    }

    function test_payAndPlay_unregistered_question_dust_to_treasury() public {
        uint256[] memory qIds = new uint256[](1);
        qIds[0] = 99; // no contributor

        uint256 treasuryBefore = token.balanceOf(treasury);
        vm.prank(player);
        pool.payAndPlay(qIds);

        assertEq(token.balanceOf(treasury), treasuryBefore + FEE);
        assertEq(pool.pendingRoyalty(contrib1), 0);
    }

    function test_payAndPlay_revert_empty_ids() public {
        uint256[] memory qIds = new uint256[](0);
        vm.prank(player);
        vm.expectRevert(CasualPool.InvalidQuestionIds.selector);
        pool.payAndPlay(qIds);
    }

    function test_payAndPlay_deducts_player_balance() public {
        uint256 before = token.balanceOf(player);
        uint256[] memory qIds = new uint256[](1);
        qIds[0] = 1;
        vm.prank(player);
        pool.payAndPlay(qIds);
        assertEq(token.balanceOf(player), before - FEE);
    }

    function test_withdrawRoyalty() public {
        uint256[] memory qIds = new uint256[](1);
        qIds[0] = 1;
        vm.prank(player);
        pool.payAndPlay(qIds);

        uint256 pending = pool.pendingRoyalty(contrib1);
        assertGt(pending, 0);

        uint256 before = token.balanceOf(contrib1);
        vm.prank(contrib1);
        pool.withdrawRoyalty();

        assertEq(pool.pendingRoyalty(contrib1), 0);
        assertEq(token.balanceOf(contrib1), before + pending);
    }

    function test_withdrawRoyalty_revert_nothing() public {
        vm.prank(contrib1);
        vm.expectRevert(abi.encodeWithSelector(CasualPool.NothingToWithdraw.selector, contrib1));
        pool.withdrawRoyalty();
    }

    function test_distributeRoyalties() public {
        uint256[] memory qIds = new uint256[](2);
        qIds[0] = 1;
        qIds[1] = 3;
        vm.prank(player);
        pool.payAndPlay(qIds);

        address[] memory contribs = new address[](2);
        contribs[0] = contrib1;
        contribs[1] = contrib2;

        uint256 c1Before = token.balanceOf(contrib1);
        uint256 c2Before = token.balanceOf(contrib2);
        uint256 c1Pending = pool.pendingRoyalty(contrib1);
        uint256 c2Pending = pool.pendingRoyalty(contrib2);

        pool.distributeRoyalties(contribs);

        assertEq(pool.pendingRoyalty(contrib1), 0);
        assertEq(pool.pendingRoyalty(contrib2), 0);
        assertEq(token.balanceOf(contrib1), c1Before + c1Pending);
        assertEq(token.balanceOf(contrib2), c2Before + c2Pending);
    }

    function test_distributeRoyalties_only_admin() public {
        address[] memory contribs = new address[](1);
        contribs[0] = contrib1;
        vm.prank(player);
        vm.expectRevert();
        pool.distributeRoyalties(contribs);
    }

    function test_10_questions_90_10_split() public {
        // Simulate 10 unique contributors
        for (uint256 i = 4; i <= 10; i++) {
            mockQP.setContributor(i, address(uint160(0xC0 + i)));
        }

        uint256[] memory qIds = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            qIds[i] = i + 1;
        }

        uint256 treasuryBefore = token.balanceOf(treasury);
        vm.prank(player);
        pool.payAndPlay(qIds);

        uint256 totalContrib = (FEE * 9000) / 10000; // 45_000
        uint256 perQ = totalContrib / 10;             // 4_500

        // contrib1 owns questions 1 & 2
        assertEq(pool.pendingRoyalty(contrib1), perQ * 2);
        // contrib2 owns question 3
        assertEq(pool.pendingRoyalty(contrib2), perQ);
        // Treasury gets 10% = 5_000 + dust (0 here since 45_000/10 is exact)
        assertEq(token.balanceOf(treasury), treasuryBefore + 5_000);
    }
}
