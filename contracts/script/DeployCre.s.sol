// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {SealRegistry} from "../src/SealRegistry.sol";
import {ISealRegistry} from "../src/interfaces/ISealRegistry.sol";
import {CordonCreReceiver} from "../src/CordonCreReceiver.sol";

contract DeployCre is Script {
    error PredictionMissed(address predicted, address actual);

    function run() external returns (SealRegistry registry, CordonCreReceiver receiver) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address[] memory local = vm.envAddress("DETECTOR_ADDRESSES", ",");
        address[] memory detectors = new address[](3);
        detectors[0] = local[0];
        detectors[1] = local[1];

        vm.startBroadcast(deployerKey);
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        receiver = new CordonCreReceiver(vm.envAddress("CRE_FORWARDER"), ISealRegistry(predicted), vm.envOr("CRE_WORKFLOW_OWNER", address(0)));
        detectors[2] = address(receiver);
        registry = new SealRegistry(
            vm.envAddress("GUARDIAN_ADDRESS"),
            detectors,
            SafeCast.toUint16(vm.envUint("QUORUM")),
            SafeCast.toUint64(vm.envUint("DISPUTE_WINDOW_SECONDS")),
            SafeCast.toUint64(vm.envUint("VOTE_LIFETIME_SECONDS")),
            SafeCast.toUint16(vm.envUint("MAX_SEALS_PER_DAY"))
        );
        vm.stopBroadcast();
        if (address(registry) != predicted) revert PredictionMissed(predicted, address(registry));

        string memory entry = "creDeployment";
        vm.serializeUint(entry, "chainId", block.chainid);
        vm.serializeUint(entry, "blockNumber", block.number);
        vm.serializeAddress(entry, "forwarder", receiver.forwarder());
        vm.serializeAddress(entry, "expectedWorkflowOwner", receiver.expectedWorkflowOwner());
        vm.serializeAddress(entry, "receiver", address(receiver));
        string memory json = vm.serializeAddress(entry, "sealRegistry", address(registry));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".cre.json"));
    }
}
