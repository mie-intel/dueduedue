// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/MockUSD.sol";

contract MockUSDTest is Test {
    MockUSD token;
    address alice = address(0x1);

    function setUp() public {
        token = MockUSD(address(new ERC1967Proxy(
            address(new MockUSD()),
            abi.encodeCall(MockUSD.initialize, ())
        )));
    }

    function test_metadata() public view {
        assertEq(token.name(), "Mock USD");
        assertEq(token.symbol(), "MockUSD");
        assertEq(token.decimals(), 18);
    }

    function test_mint() public {
        uint256 amount = 100e18;
        token.mint(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.totalSupply(), amount);
    }

    function test_mint_anyone_can_call() public {
        vm.prank(alice);
        token.mint(alice, 50e18);
        assertEq(token.balanceOf(alice), 50e18);
    }

    function test_transfer() public {
        token.mint(alice, 100e18);
        vm.prank(alice);
        token.transfer(address(0x2), 30e18);
        assertEq(token.balanceOf(alice), 70e18);
        assertEq(token.balanceOf(address(0x2)), 30e18);
    }
}
