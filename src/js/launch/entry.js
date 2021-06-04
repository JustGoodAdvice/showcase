import launchFrame from "./launchFrame";
import launch from "./index";

const imports = {
  launch: launch,
  launchFrame: launchFrame,
}

// init appropriate view
// init page-level scripts ... only when defined by in-page HTML
const $pageScript = $("#__init");
if ($pageScript.length) {
  const { pageInit } = $pageScript.data();
  if (!imports[pageInit]) {
    throw new Error("pageInit defined but is not in imports", pageInit);
  }
  new imports[pageInit]().init();
}
