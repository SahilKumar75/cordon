// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {SealRegistry} from "../src/SealRegistry.sol";
import {ISealRegistry} from "../src/interfaces/ISealRegistry.sol";

contract SealRegistryTest is Test {
    string constant npm = "npm";
    string constant packageName = "@bulkheaddemo/colorkit";
    string constant badVersion = "1.4.1";
    string constant goodVersion = "1.4.0";
    bytes32 constant sharedColorkitKey = 0xcaccc21823241057a2f46d40967c70130ebb0f8d5d6b85e3b92eefc40c71ce71;
    bytes32 constant evidence = keccak256("evidence");
    bytes32 constant reason = keccak256("reason");
    uint64 constant window = 1 days;
    uint64 constant startTime = 1_800_000_000;

    address guardian = makeAddr("guardian");
    address detectorA = makeAddr("detectorA");
    address detectorB = makeAddr("detectorB");
    address detectorC = makeAddr("detectorC");
    address stranger = makeAddr("stranger");

    SealRegistry registry;

    event VerdictSubmitted(bytes32 indexed key, address indexed detector, bytes32 evidenceHash, uint16 votes, uint64 at);
    event Sealed(bytes32 indexed key, string ecosystem, string name, string version, uint16 votes, uint64 at);
    event Unsealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Resealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);

    function setUp() public {
        vm.warp(startTime);
        registry = new SealRegistry(guardian, detectors(), 2, window, 2);
    }

    function detectors() internal view returns (address[] memory list) {
        list = new address[](3);
        list[0] = detectorA;
        list[1] = detectorB;
        list[2] = detectorC;
    }

    function vote(address detector, string memory version) internal returns (bytes32) {
        vm.prank(detector);
        return registry.submitVerdict(npm, packageName, version, evidence);
    }

    function sealVersion(string memory version) internal returns (bytes32 key) {
        vote(detectorA, version);
        key = vote(detectorB, version);
    }

    function unsealAfterWindow(bytes32 key) internal {
        vm.warp(startTime + window);
        vm.prank(guardian);
        registry.unseal(key, reason);
    }

    function expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role));
    }

    function test_configIsExposed() public view {
        assertEq(registry.quorum(), 2);
        assertEq(registry.disputeWindow(), window);
        assertEq(registry.maxSealsPerDay(), 2);
        assertTrue(registry.hasRole(registry.GUARDIAN_ROLE(), guardian));
        assertTrue(registry.hasRole(registry.DETECTOR_ROLE(), detectorC));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), guardian));
    }

    function test_constructorRejectsZeroQuorum() public {
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(guardian, detectors(), 0, window, 2);
    }

    function test_constructorRejectsQuorumAboveDetectorCount() public {
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(guardian, detectors(), 4, window, 2);
    }

    function test_constructorRejectsRepeatedDetector() public {
        address[] memory list = detectors();
        list[2] = detectorA;
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(guardian, list, 2, window, 2);
    }

    function test_constructorRejectsZeroDetector() public {
        address[] memory list = detectors();
        list[1] = address(0);
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(guardian, list, 2, window, 2);
    }

    function test_constructorRejectsZeroGuardian() public {
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(address(0), detectors(), 2, window, 2);
    }

    function test_constructorRejectsZeroMaxSealsPerDay() public {
        vm.expectRevert(ISealRegistry.InvalidConfig.selector);
        new SealRegistry(guardian, detectors(), 2, window, 0);
    }

    function test_keyOfMatchesSharedSealKeyOf() public view {
        assertEq(registry.keyOf(npm, packageName, badVersion), sharedColorkitKey);
    }

    function test_quorumSealsExactlyAtThreshold() public {
        bytes32 key = vote(detectorA, badVersion);
        ISealRegistry.Seal memory belowQuorum = registry.getSeal(key);
        assertEq(uint8(belowQuorum.status), uint8(ISealRegistry.Status.None));
        assertEq(belowQuorum.votes, 1);
        assertEq(belowQuorum.firstVoteAt, startTime);
        assertFalse(registry.isSealed(key));
        assertEq(registry.sealedKeyCount(), 0);

        vm.warp(startTime + 60);
        vote(detectorB, badVersion);
        ISealRegistry.Seal memory atQuorum = registry.getSeal(key);
        assertEq(uint8(atQuorum.status), uint8(ISealRegistry.Status.Sealed));
        assertEq(atQuorum.votes, 2);
        assertEq(atQuorum.firstVoteAt, startTime);
        assertEq(atQuorum.sealedAt, startTime + 60);
        assertTrue(registry.isSealed(key));
        assertEq(registry.sealedKeyCount(), 1);
    }

    function test_hasVotedTracksEachDetector() public {
        bytes32 key = vote(detectorA, badVersion);
        assertTrue(registry.hasVoted(key, detectorA));
        assertFalse(registry.hasVoted(key, detectorB));
    }

    function test_duplicateVoteReverts() public {
        bytes32 key = vote(detectorA, badVersion);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.DuplicateVote.selector, key, detectorA));
        vote(detectorA, badVersion);
    }

    function test_nonDetectorCannotVote() public {
        expectUnauthorized(stranger, registry.DETECTOR_ROLE());
        vote(stranger, badVersion);
    }

    function test_guardianCannotVote() public {
        expectUnauthorized(guardian, registry.DETECTOR_ROLE());
        vote(guardian, badVersion);
    }

    function test_emptyEvidenceReverts() public {
        vm.prank(detectorA);
        vm.expectRevert(ISealRegistry.EmptyEvidence.selector);
        registry.submitVerdict(npm, packageName, badVersion, bytes32(0));
    }

    function test_otherEcosystemReverts() public {
        vm.prank(detectorA);
        vm.expectRevert(ISealRegistry.InvalidEcosystem.selector);
        registry.submitVerdict("pypi", packageName, badVersion, evidence);
    }

    function test_voteOnSealedKeyReverts() public {
        bytes32 key = sealVersion(badVersion);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.AlreadySealed.selector, key));
        vote(detectorC, badVersion);
    }

    function test_voteOnUnsealedKeyReverts() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.KeyUnsealed.selector, key));
        vote(detectorC, badVersion);
    }

    function test_unsealBeforeDisputeWindowReverts() public {
        bytes32 key = sealVersion(badVersion);
        vm.warp(startTime + window - 1);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.DisputeWindowOpen.selector, startTime + window));
        registry.unseal(key, reason);
    }

    function test_unsealAtDisputeWindowSucceeds() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        ISealRegistry.Seal memory seal = registry.getSeal(key);
        assertEq(uint8(seal.status), uint8(ISealRegistry.Status.Unsealed));
        assertEq(seal.unsealedAt, startTime + window);
        assertFalse(registry.isSealed(key));
    }

    function test_unsealRequiresSealed() public {
        bytes32 key = registry.keyOf(npm, packageName, badVersion);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.NotSealed.selector, key));
        registry.unseal(key, reason);
    }

    function test_resealOnlyFromUnsealed() public {
        bytes32 key = registry.keyOf(npm, packageName, badVersion);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.NotUnsealed.selector, key));
        registry.reseal(key, reason);

        sealVersion(badVersion);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.NotUnsealed.selector, key));
        registry.reseal(key, reason);
    }

    function test_resealRestoresSealedWithNewSealedAt() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        vm.warp(startTime + window + 100);
        vm.prank(guardian);
        registry.reseal(key, reason);
        ISealRegistry.Seal memory seal = registry.getSeal(key);
        assertEq(uint8(seal.status), uint8(ISealRegistry.Status.Sealed));
        assertEq(seal.sealedAt, startTime + window + 100);
        assertEq(registry.sealedKeyCount(), 1);
    }

    function test_resealIsNotRateLimited() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        sealVersion("2.0.0");
        sealVersion("2.0.1");
        vm.prank(guardian);
        registry.reseal(key, reason);
        assertTrue(registry.isSealed(key));
    }

    function test_onlyGuardianCanUnseal() public {
        bytes32 key = sealVersion(badVersion);
        vm.warp(startTime + window);
        expectUnauthorized(detectorA, registry.GUARDIAN_ROLE());
        vm.prank(detectorA);
        registry.unseal(key, reason);
    }

    function test_onlyGuardianCanReseal() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        expectUnauthorized(stranger, registry.GUARDIAN_ROLE());
        vm.prank(stranger);
        registry.reseal(key, reason);
    }

    function test_versionsStayIndependent() public {
        bytes32 badKey = sealVersion(badVersion);
        bytes32 goodKey = registry.keyOf(npm, packageName, goodVersion);
        assertTrue(badKey != goodKey);
        assertTrue(registry.isSealed(badKey));
        assertFalse(registry.isSealed(goodKey));
        assertEq(registry.getSeal(goodKey).votes, 0);
        vote(detectorA, goodVersion);
        assertEq(registry.getSeal(goodKey).votes, 1);
        assertEq(registry.getSeal(badKey).votes, 2);
    }

    function test_sealRateLimitPerUtcDay() public {
        sealVersion("1.0.0");
        sealVersion("1.0.1");
        vote(detectorA, "1.0.2");
        uint64 day = startTime / 1 days;
        vm.expectRevert(abi.encodeWithSelector(ISealRegistry.SealRateLimited.selector, day));
        vote(detectorB, "1.0.2");

        bytes32 key = registry.keyOf(npm, packageName, "1.0.2");
        assertFalse(registry.hasVoted(key, detectorB));
        assertEq(registry.getSeal(key).votes, 1);

        vm.warp((day + 1) * 1 days);
        vote(detectorB, "1.0.2");
        assertTrue(registry.isSealed(key));
        assertEq(registry.sealedKeyCount(), 3);
    }

    function test_verdictSubmittedEvent() public {
        bytes32 key = registry.keyOf(npm, packageName, badVersion);
        vm.expectEmit(true, true, false, true, address(registry));
        emit VerdictSubmitted(key, detectorA, evidence, 1, startTime);
        vote(detectorA, badVersion);
    }

    function test_sealedEvent() public {
        bytes32 key = vote(detectorA, badVersion);
        vm.warp(startTime + 5);
        vm.expectEmit(true, true, false, true, address(registry));
        emit VerdictSubmitted(key, detectorB, evidence, 2, startTime + 5);
        vm.expectEmit(true, false, false, true, address(registry));
        emit Sealed(key, npm, packageName, badVersion, 2, startTime + 5);
        vote(detectorB, badVersion);
    }

    function test_unsealedEvent() public {
        bytes32 key = sealVersion(badVersion);
        vm.warp(startTime + window);
        vm.expectEmit(true, true, false, true, address(registry));
        emit Unsealed(key, guardian, reason, startTime + window);
        vm.prank(guardian);
        registry.unseal(key, reason);
    }

    function test_resealedEvent() public {
        bytes32 key = sealVersion(badVersion);
        unsealAfterWindow(key);
        vm.expectEmit(true, true, false, true, address(registry));
        emit Resealed(key, guardian, reason, startTime + window);
        vm.prank(guardian);
        registry.reseal(key, reason);
    }

    function test_guardianCannotGrantRole() public {
        bytes32 detectorRole = registry.DETECTOR_ROLE();
        expectUnauthorized(guardian, registry.DEFAULT_ADMIN_ROLE());
        vm.prank(guardian);
        registry.grantRole(detectorRole, stranger);
        assertFalse(registry.hasRole(detectorRole, stranger));
    }

    function test_guardianCannotRevokeRole() public {
        bytes32 detectorRole = registry.DETECTOR_ROLE();
        expectUnauthorized(guardian, registry.DEFAULT_ADMIN_ROLE());
        vm.prank(guardian);
        registry.revokeRole(detectorRole, detectorA);
        assertTrue(registry.hasRole(detectorRole, detectorA));
    }

    function test_detectorCannotRenounceRole() public {
        bytes32 detectorRole = registry.DETECTOR_ROLE();
        vm.prank(detectorA);
        vm.expectRevert(ISealRegistry.RolesFrozen.selector);
        registry.renounceRole(detectorRole, detectorA);
        assertTrue(registry.hasRole(detectorRole, detectorA));
    }

    function test_guardianCannotRenounceRole() public {
        bytes32 guardianRole = registry.GUARDIAN_ROLE();
        vm.prank(guardian);
        vm.expectRevert(ISealRegistry.RolesFrozen.selector);
        registry.renounceRole(guardianRole, guardian);
        assertTrue(registry.hasRole(guardianRole, guardian));
    }

    function test_sealedKeysPaging() public {
        bytes32 first = sealVersion("1.0.0");
        bytes32 second = sealVersion("1.0.1");
        vm.warp(startTime + window);
        bytes32 third = sealVersion("1.0.2");
        vm.prank(guardian);
        registry.unseal(second, reason);

        (bytes32[] memory keys, ISealRegistry.Status[] memory statuses) = registry.sealedKeys(0, 2);
        assertEq(keys.length, 2);
        assertEq(keys[0], first);
        assertEq(keys[1], second);
        assertEq(uint8(statuses[0]), uint8(ISealRegistry.Status.Sealed));
        assertEq(uint8(statuses[1]), uint8(ISealRegistry.Status.Unsealed));

        (keys, statuses) = registry.sealedKeys(2, 2);
        assertEq(keys.length, 1);
        assertEq(keys[0], third);
        assertEq(uint8(statuses[0]), uint8(ISealRegistry.Status.Sealed));

        (keys, statuses) = registry.sealedKeys(3, 2);
        assertEq(keys.length, 0);
        assertEq(statuses.length, 0);

        (keys,) = registry.sealedKeys(0, 0);
        assertEq(keys.length, 0);
    }
}
