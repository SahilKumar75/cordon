// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {SealRegistry} from "../src/SealRegistry.sol";
import {ISealRegistry} from "../src/interfaces/ISealRegistry.sol";
import {CordonCreReceiver, IReceiver} from "../src/CordonCreReceiver.sol";

contract CordonCreReceiverTest is Test {
    address internal forwarder = makeAddr("forwarder");
    address internal staticScripts = makeAddr("staticScripts");
    address internal sandboxCanary = makeAddr("sandboxCanary");
    address internal workflowOwner = makeAddr("workflowOwner");
    bytes32 internal evidence = keccak256("osv MAL-2026-3465");

    function deployPair(address expectedOwner) internal returns (SealRegistry registry, CordonCreReceiver receiver) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receiver = new CordonCreReceiver(forwarder, ISealRegistry(predicted), expectedOwner);
        address[] memory detectors = new address[](3);
        detectors[0] = staticScripts;
        detectors[1] = sandboxCanary;
        detectors[2] = address(receiver);
        registry = new SealRegistry(makeAddr("guardian"), detectors, 2, 3600, 86400, 10);
        assertEq(address(registry), predicted);
    }

    function report() internal view returns (bytes memory) {
        return abi.encode("@cordondemo/colorkit", "1.4.1", evidence);
    }

    function metadataFor(address owner) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes10("cordonAdv"), owner);
    }

    function test_receiverVoteAndOneDetectorVoteReachQuorum() public {
        (SealRegistry registry, CordonCreReceiver receiver) = deployPair(address(0));
        vm.prank(forwarder);
        receiver.onReport("", report());
        bytes32 key = registry.keyOf("npm", "@cordondemo/colorkit", "1.4.1");
        assertTrue(registry.hasVoted(key, address(receiver)));
        assertFalse(registry.isSealed(key));
        vm.prank(staticScripts);
        registry.submitVerdict("npm", "@cordondemo/colorkit", "1.4.1", keccak256("static"));
        assertTrue(registry.isSealed(key));
    }

    function test_onlyTheForwarderCanDeliverReports() public {
        (, CordonCreReceiver receiver) = deployPair(address(0));
        vm.expectRevert(abi.encodeWithSelector(CordonCreReceiver.NotForwarder.selector, address(this)));
        receiver.onReport("", report());
    }

    function test_deployedReceiverChecksTheWorkflowOwner() public {
        (SealRegistry registry, CordonCreReceiver receiver) = deployPair(workflowOwner);
        address stranger = makeAddr("stranger");
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(CordonCreReceiver.WrongWorkflowOwner.selector, stranger));
        receiver.onReport(metadataFor(stranger), report());
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(CordonCreReceiver.MetadataTooShort.selector, 0));
        receiver.onReport("", report());
        vm.prank(forwarder);
        receiver.onReport(metadataFor(workflowOwner), report());
        assertTrue(registry.hasVoted(registry.keyOf("npm", "@cordondemo/colorkit", "1.4.1"), address(receiver)));
    }

    function test_aRepeatedReportIsRejectedAsADuplicateVote() public {
        (, CordonCreReceiver receiver) = deployPair(address(0));
        vm.startPrank(forwarder);
        receiver.onReport("", report());
        vm.expectRevert();
        receiver.onReport("", report());
        vm.stopPrank();
    }

    function test_reportsItsInterfaces() public {
        (, CordonCreReceiver receiver) = deployPair(address(0));
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(receiver.supportsInterface(type(IERC165).interfaceId));
        assertFalse(receiver.supportsInterface(bytes4(0xdeadbeef)));
    }
}
