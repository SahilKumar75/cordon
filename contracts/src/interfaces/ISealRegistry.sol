// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

interface ISealRegistry is IAccessControl {
    enum Status {
        None,
        Sealed,
        Unsealed
    }

    struct Seal {
        Status status;
        uint16 votes;
        uint64 firstVoteAt;
        uint64 sealedAt;
        uint64 unsealedAt;
    }

    event VerdictSubmitted(bytes32 indexed key, address indexed detector, bytes32 evidenceHash, uint16 votes, uint64 at);
    event Sealed(bytes32 indexed key, string ecosystem, string name, string version, uint16 votes, uint64 at);
    event Unsealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Resealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);

    error InvalidConfig();
    error EmptyEvidence();
    error InvalidEcosystem();
    error DuplicateVote(bytes32 key, address detector);
    error AlreadySealed(bytes32 key);
    error KeyUnsealed(bytes32 key);
    error NotSealed(bytes32 key);
    error NotUnsealed(bytes32 key);
    error DisputeWindowOpen(uint64 opensAt);
    error SealRateLimited(uint64 day);
    error RolesFrozen();

    function DETECTOR_ROLE() external view returns (bytes32);
    function GUARDIAN_ROLE() external view returns (bytes32);
    function quorum() external view returns (uint16);
    function disputeWindow() external view returns (uint64);
    function maxSealsPerDay() external view returns (uint16);
    function keyOf(string calldata ecosystem, string calldata name, string calldata version)
        external
        pure
        returns (bytes32);
    function submitVerdict(
        string calldata ecosystem,
        string calldata name,
        string calldata version,
        bytes32 evidenceHash
    ) external returns (bytes32 key);
    function unseal(bytes32 key, bytes32 reasonHash) external;
    function reseal(bytes32 key, bytes32 reasonHash) external;
    function getSeal(bytes32 key) external view returns (Seal memory);
    function isSealed(bytes32 key) external view returns (bool);
    function hasVoted(bytes32 key, address detector) external view returns (bool);
    function sealedKeyCount() external view returns (uint256);
    function sealedKeys(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory keys, Status[] memory statuses);
}
