import EulerJSON from "@eulerxyz/euler-interfaces/abis/Euler.json";
import PTokenJSON from "@eulerxyz/euler-interfaces/abis/PToken.json";
import ETokenJSON from "@eulerxyz/euler-interfaces/abis/modules/EToken.json";
import DTokenJSON from "@eulerxyz/euler-interfaces/abis/modules/DToken.json";
import ExecJSON from "@eulerxyz/euler-interfaces/abis/modules/Exec.json";
import LiquidationJSON from "@eulerxyz/euler-interfaces/abis/modules/Liquidation.json";
import MarketsJSON from "@eulerxyz/euler-interfaces/abis/modules/Markets.json";
import SwapJSON from "@eulerxyz/euler-interfaces/abis/modules/Swap.json";
import EulStakesJSON from "@eulerxyz/euler-interfaces/abis/mining/EulStakes.json";
import EulDistributorJSON from "@eulerxyz/euler-interfaces/abis/mining/EulDistributor.json";
import EulerGeneralViewJSON from "@eulerxyz/euler-interfaces/abis/views/EulerGeneralView.json";

export default {
  euler: EulerJSON.abi,
  pToken: PTokenJSON.abi,
  eToken: ETokenJSON.abi,
  dToken: DTokenJSON.abi,
  exec: ExecJSON.abi,
  liquidation: LiquidationJSON.abi,
  markets: MarketsJSON.abi,
  swap: SwapJSON.abi,
  eulStakes: EulStakesJSON.abi,
  eulDistributor: EulDistributorJSON.abi,
  eulerGeneralView: EulerGeneralViewJSON.abi,
};
