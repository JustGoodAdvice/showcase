import qs from "querystring";
import Showcase from "./showcase";
import ShowcaseHarness from "./showcaseHarness";
import ShowcaseMobile from "./showcaseMobile";
import ShowcaseVirtualAsst from "./showcaseVirtualAsst";
import ShowcaseSalesforce from "./showcaseSalesforce";
import ShowcaseCleanshot from "./showcaseCleanshot";

// demo nav links
$("main").on("click", "nav.menubar a[data-target]", e => {
  e.preventDefault();
  const $el = $(e.currentTarget);
  const { target } = $el.data();
  let link = `/s/${window.jga.api.adviceset.id}/`;
  if (target == "mobile") {
    link += "mobile/";
  } else if (target == "asst") {
    link += "virtual-assistant/";
  } else if (target == "salesforce") {
    link += "salesforce/";
  } else if (target == "harness") {
    link += "harness/";
  }
  let querystr = qs.parse(location.search.substr(1));
  if (target == "salesforce") {
    querystr = Object.assign(querystr, { audienceId: "gRGmgTjX7" });
  } else {
    delete querystr.audienceId;
  }
  window.location.href = `${link}?${qs.stringify(querystr)}`;
});

const imports = {
  showcase: Showcase,
  showcaseHarness: ShowcaseHarness,
  showcaseMobile: ShowcaseMobile,
  showcaseVirtualAsst: ShowcaseVirtualAsst,
  showcaseSalesforce: ShowcaseSalesforce,
  showcaseCleanshot: ShowcaseCleanshot
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
