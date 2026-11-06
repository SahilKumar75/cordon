// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ISealRegistry} from "./interfaces/ISealRegistry.sol";

contract SealRegistry is ISealRegistry, AccessControl {
    bytes32 public constant DETECTOR_ROLE = keccak256("DETECTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 private constant npmHash = keccak256("npm");

    uint16 public immutable quorum;
    uint64 public immutable disputeWindow;
    uint64 public immutable voteLifetime;
    uint16 public immutable maxSealsPerDay;

    mapping(bytes32 => Seal) private seals;
    mapping(bytes32 => mapping(address => uint64)) private votedAt;
    mapping(bytes32 => address[]) private voters;
    mapping(uint64 => uint16) private sealsOnDay;
    bytes32[] private sealedKeyList;
    bytes32[] private flaggedKeyList;

    constructor(
        address guardian,
        address[] memory detectors,
        uint16 quorum_,
        uint64 disputeWindow_,
        uint64 voteLifetime_,
        uint16 maxSealsPerDay_
    ) {
        if (
            guardian == address(0) || quorum_ == 0 || quorum_ > detectors.length || voteLifetime_ == 0
                || maxSealsPerDay_ == 0
        ) {
            revert InvalidConfig();
        }
        _grantRole(GUARDIAN_ROLE, guardian);
        for (uint256 i = 0; i < detectors.length; i++) {
            if (detectors[i] == address(0) || !_grantRole(DETECTOR_ROLE, detectors[i])) revert InvalidConfig();
        }
        quorum = quorum_;
        disputeWindow = disputeWindow_;
        voteLifetime = voteLifetime_;
        maxSealsPerDay = maxSealsPerDay_;
    }

    function keyOf(string calldata ecosystem, string calldata name, string calldata version)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(ecosystem, name, version));
    }

    function submitVerdict(
        string calldata ecosystem,
        string calldata name,
        string calldata version,
        bytes32 evidenceHash
    ) external onlyRole(DETECTOR_ROLE) returns (bytes32 key) {
        if (keccak256(bytes(ecosystem)) != npmHash) revert InvalidEcosystem();
        if (evidenceHash == bytes32(0)) revert EmptyEvidence();
        key = keyOf(ecosystem, name, version);
        Seal storage seal = seals[key];
        if (seal.status == Status.Sealed) revert AlreadySealed(key);
        if (seal.status == Status.Unsealed) revert KeyUnsealed(key);
        if (seal.status == Status.Cleared) revert KeyCleared(key);
        uint64 previousVote = votedAt[key][msg.sender];
        if (!isRefreshable(previousVote)) revert DuplicateVote(key, msg.sender);
        if (previousVote == 0) voters[key].push(msg.sender);
        votedAt[key][msg.sender] = uint64(block.timestamp);
        if (seal.firstVoteAt == 0) {
            seal.firstVoteAt = uint64(block.timestamp);
            flaggedKeyList.push(key);
        }
        seal.votes = countLive(key);
        emit VerdictSubmitted(key, msg.sender, evidenceHash, seal.votes, uint64(block.timestamp));
        if (seal.votes < quorum) return key;
        uint64 day = uint64(block.timestamp / 1 days);
        if (sealsOnDay[day] == maxSealsPerDay) revert SealRateLimited(day);
        sealsOnDay[day] += 1;
        markSealed(seal, key);
        emit Sealed(key, ecosystem, name, version, quorum, uint64(block.timestamp));
    }

    function markSealed(Seal storage seal, bytes32 key) private {
        if (seal.sealedAt == 0) sealedKeyList.push(key);
        seal.status = Status.Sealed;
        seal.sealedAt = uint64(block.timestamp);
    }

    function countLive(bytes32 key) private view returns (uint16 live) {
        address[] storage list = voters[key];
        for (uint256 i = 0; i < list.length; i++) {
            if (isLive(votedAt[key][list[i]])) live++;
        }
    }

    function isRefreshable(uint64 at) private view returns (bool) {
        return at == 0 || block.timestamp >= uint256(at) + voteLifetime / 2;
    }

    function requireSuspect(Seal storage seal, bytes32 key) private view {
        if (seal.status != Status.None || countLive(key) == 0) revert NotSuspect(key);
    }

    function promote(bytes32 key, bytes32 reasonHash) external onlyRole(GUARDIAN_ROLE) {
        Seal storage seal = seals[key];
        requireSuspect(seal, key);
        seal.votes = countLive(key);
        markSealed(seal, key);
        emit Promoted(key, msg.sender, reasonHash, seal.sealedAt);
    }

    function clear(bytes32 key, bytes32 reasonHash) external onlyRole(GUARDIAN_ROLE) {
        Seal storage seal = seals[key];
        requireSuspect(seal, key);
        seal.status = Status.Cleared;
        seal.clearedAt = uint64(block.timestamp);
        emit Cleared(key, msg.sender, reasonHash, seal.clearedAt);
    }

    function isLive(uint64 at) private view returns (bool) {
        return at != 0 && block.timestamp < uint256(at) + voteLifetime;
    }

    function renounceRole(bytes32, address) public pure override(AccessControl, IAccessControl) {
        revert RolesFrozen();
    }

    function unseal(bytes32 key, bytes32 reasonHash) external onlyRole(GUARDIAN_ROLE) {
        Seal storage seal = seals[key];
        if (seal.status != Status.Sealed) revert NotSealed(key);
        uint64 opensAt = seal.sealedAt + disputeWindow;
        if (block.timestamp < opensAt) revert DisputeWindowOpen(opensAt);
        seal.status = Status.Unsealed;
        seal.unsealedAt = uint64(block.timestamp);
        emit Unsealed(key, msg.sender, reasonHash, seal.unsealedAt);
    }

    function reseal(bytes32 key, bytes32 reasonHash) external onlyRole(GUARDIAN_ROLE) {
        Seal storage seal = seals[key];
        if (seal.status != Status.Unsealed && seal.status != Status.Cleared) revert NotUnsealed(key);
        markSealed(seal, key);
        emit Resealed(key, msg.sender, reasonHash, seal.sealedAt);
    }

    function getSeal(bytes32 key) external view returns (Seal memory) {
        return seals[key];
    }

    function isSealed(bytes32 key) external view returns (bool) {
        return seals[key].status == Status.Sealed;
    }

    function hasVoted(bytes32 key, address detector) external view returns (bool) {
        return isLive(votedAt[key][detector]);
    }

    function canVote(bytes32 key, address detector) external view returns (bool) {
        return seals[key].status == Status.None && isRefreshable(votedAt[key][detector]);
    }

    function liveVotes(bytes32 key) external view returns (uint16) {
        return countLive(key);
    }

    function isSuspect(bytes32 key) external view returns (bool) {
        return seals[key].status == Status.None && countLive(key) > 0;
    }

    function flaggedKeyCount() external view returns (uint256) {
        return flaggedKeyList.length;
    }

    function flaggedKeys(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory keys, Status[] memory statuses, uint16[] memory votes)
    {
        keys = page(flaggedKeyList, offset, limit);
        statuses = new Status[](keys.length);
        votes = new uint16[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            statuses[i] = seals[keys[i]].status;
            votes[i] = countLive(keys[i]);
        }
    }

    function page(bytes32[] storage list, uint256 offset, uint256 limit) private view returns (bytes32[] memory keys) {
        uint256 total = list.length;
        uint256 count = offset >= total ? 0 : total - offset < limit ? total - offset : limit;
        keys = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            keys[i] = list[offset + i];
        }
    }

    function sealedKeyCount() external view returns (uint256) {
        return sealedKeyList.length;
    }

    function sealedKeys(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory keys, Status[] memory statuses)
    {
        keys = page(sealedKeyList, offset, limit);
        statuses = new Status[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            statuses[i] = seals[keys[i]].status;
        }
    }
}
