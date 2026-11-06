import {
  consensusIdenticalAggregation,
  cre,
  decodeJson,
  getNetwork,
  hexToBase64,
  ok,
  prepareReportRequest,
  Runner,
  text,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { toHex } from "viem";
import { osvQueryBody, reportPayloadOf, verdictOf, type Target } from "./advisory.ts";

type Config = { osvUrl: string; chainSelectorName: string; receiver: string; gasLimit: string };

const queryOsv = (sender: HTTPSendRequester, request: { url: string; body: string }): string => {
  const response = sender
    .sendRequest({
      url: request.url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: hexToBase64(toHex(request.body)),
      cacheSettings: { store: true, maxAge: "60s" },
    })
    .result();
  if (!ok(response)) throw new Error(`OSV answered ${response.statusCode}`);
  return text(response);
};

const onAdvisoryRequest = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const target = decodeJson(payload.input) as Target;
  const http = new cre.capabilities.HTTPClient();
  const osvText = http
    .sendRequest(runtime, queryOsv, consensusIdenticalAggregation<string>())({ url: runtime.config.osvUrl, body: osvQueryBody(target) })
    .result();
  const verdict = verdictOf(target, osvText);
  runtime.log(`${target.name}@${target.version}: ${verdict.malicious ? `malicious ${verdict.malIds.join(" ")}` : "clean, kept off chain"}`);
  if (!verdict.malicious) return "clean";

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown chain ${runtime.config.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const report = runtime.report(prepareReportRequest(reportPayloadOf(verdict))).result();
  const reply = evm.writeReport(runtime, { receiver: runtime.config.receiver, report, gasConfig: { gasLimit: runtime.config.gasLimit } }).result();
  runtime.log(`writeReport ${reply.txStatus} ${reply.txHash ? toHex(reply.txHash) : "no tx hash"}`);
  return "malicious";
};

const initWorkflow = () => [cre.handler(new cre.capabilities.HTTPCapability().trigger({}), onAdvisoryRequest)];

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
