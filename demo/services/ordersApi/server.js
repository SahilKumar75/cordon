import { colorize } from "@cordondemo/colorkit";
import { serve } from "../serve.js";

serve("ordersApi", () => ({ orders: [{ id: 1, status: colorize("shipped", "green") }] }));
