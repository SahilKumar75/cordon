// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ISealRegistry} from "./interfaces/ISealRegistry.sol";

contract SealRegistry is ISealRegistry, AccessControl {
    bytes32 public constant DETECTOR_ROLE = keccak256("DETECTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 private constant npmHash = keccak256("npm");

    uint16 public immutable quorum;
    uint64 public immutable disputeWindow;
    uint16 public immutable maxSealsPerDay;

    mapping(bytes32 => Seal) private seals;
    mapping(bytes32 => mapping(address => bool)) private votedBy;
    mapping(uint64 => uint16) private sealsOnDay;
    bytes32[] private sealedKeyList;

    constructor(
        address guardian,
        address[] memory detectors,
        uint16 quorum_,
        uint64 disputeWindow_,
        uint16 maxSealsPerDay_
    ) {
        if (guardian == address(0) || quorum_ == 0 || quorum_ > detectors.length || maxSealsPerDay_ == 0) {
            revert InvalidConfig();
        }
        _grantRole(GUARDIAN_ROLE, guardian);
        for (uint256 i = 0; i < detectors.length; i++) {
            if (detectors[i] == address(0) || !_grantRole(DETECTOR_ROLE, detectors[i])) revert InvalidConfig();
        }
        quorum = quorum_;
        disputeWindow = disputeWindow_;
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
        if (votedBy[key][msg.sender]) revert DuplicateVote(key, msg.sender);
        recordVote(seal, key, evidenceHash);
        if (seal.votes == quorum) sealKey(seal, key, ecosystem, name, version);
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
        if (seal.status != Status.Unsealed) revert NotUnsealed(key);
        seal.status = Status.Sealed;
        seal.sealedAt = uint64(block.timestamp);
        emit Resealed(key, msg.sender, reasonHash, seal.sealedAt);
    }

    function getSeal(bytes32 key) external view returns (Seal memory) {
        return seals[key];
    }

    function isSealed(bytes32 key) external view returns (bool) {
        return seals[key].status == Status.Sealed;
    }

    function hasVoted(bytes32 key, address detector) external view returns (bool) {
        return votedBy[key][detector];
    }

    function sealedKeyCount() external view returns (uint256) {
        return sealedKeyList.length;
    }

    function sealedKeys(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory keys, Status[] memory statuses)
    {
        uint256 total = sealedKeyList.length;
        uint256 count = offset >= total ? 0 : total - offset < limit ? total - offset : limit;
        keys = new bytes32[](count);
        statuses = new Status[](count);
        for (uint256 i = 0; i < count; i++) {
            keys[i] = sealedKeyList[offset + i];
            statuses[i] = seals[keys[i]].status;
        }
    }

    function recordVote(Seal storage seal, bytes32 key, bytes32 evidenceHash) private {
        votedBy[key][msg.sender] = true;
        if (seal.votes == 0) seal.firstVoteAt = uint64(block.timestamp);
        seal.votes += 1;
        emit VerdictSubmitted(key, msg.sender, evidenceHash, seal.votes, uint64(block.timestamp));
    }

    function sealKey(
        Seal storage seal,
        bytes32 key,
        string calldata ecosystem,
        string calldata name,
        string calldata version
    ) private {
        uint64 day = uint64(block.timestamp / 1 days);
        if (sealsOnDay[day] == maxSealsPerDay) revert SealRateLimited(day);
        sealsOnDay[day] += 1;
        seal.status = Status.Sealed;
        seal.sealedAt = uint64(block.timestamp);
        sealedKeyList.push(key);
        emit Sealed(key, ecosystem, name, version, quorum, uint64(block.timestamp));
    }
}
