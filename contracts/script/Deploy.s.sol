// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {SealRegistry} from "../src/SealRegistry.sol";

contract Deploy is Script {
    function run() external returns (SealRegistry registry) {
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address[] memory detectors = vm.envAddress("DETECTOR_ADDRESSES", ",");
        uint16 quorum = SafeCast.toUint16(vm.envUint("QUORUM"));
        uint64 disputeWindow = SafeCast.toUint64(vm.envUint("DISPUTE_WINDOW_SECONDS"));
        uint64 voteLifetime = SafeCast.toUint64(vm.envUint("VOTE_LIFETIME_SECONDS"));
        uint16 maxSealsPerDay = SafeCast.toUint16(vm.envUint("MAX_SEALS_PER_DAY"));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        registry = new SealRegistry(guardian, detectors, quorum, disputeWindow, voteLifetime, maxSealsPerDay);
        vm.stopBroadcast();

        string memory entry = "deployment";
        vm.serializeUint(entry, "chainId", block.chainid);
        vm.serializeUint(entry, "blockNumber", block.number);
        vm.serializeAddress(entry, "guardian", guardian);
        vm.serializeAddress(entry, "detectors", detectors);
        vm.serializeUint(entry, "quorum", registry.quorum());
        vm.serializeUint(entry, "disputeWindow", registry.disputeWindow());
        vm.serializeUint(entry, "voteLifetime", registry.voteLifetime());
        vm.serializeUint(entry, "maxSealsPerDay", registry.maxSealsPerDay());
        string memory json = vm.serializeAddress(entry, "sealRegistry", address(registry));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
    }
}
