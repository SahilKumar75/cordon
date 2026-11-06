import { colorize } from "@cordondemo/colorkit";
import { serve } from "../serve.js";

serve("notifyWorker", () => ({ queued: 0, banner: colorize("notifications idle", "yellow") }));
