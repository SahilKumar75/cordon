import { colorize } from "@cordondemo/colorkit";
import { serve } from "../serve.js";

serve("searchApi", (request) => ({ query: new URL(request.url, "http://search").searchParams.get("q"), results: [colorize("colorkit", "blue")] }));
