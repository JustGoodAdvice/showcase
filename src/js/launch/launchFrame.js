import { createBrowserHistory } from "history";
import qs from "querystring";

export default class {
  constructor() {
    window.jga.launch_history = createBrowserHistory();
  }

  init() {
    const iframe_className = "iframe-preview";
    const iframe_className_mobile = "iframe-preview--mobile";
    const iframe_className_desktop = "iframe-preview--desktop";
    const iframeClasses = [iframe_className,iframe_className_desktop,iframe_className_mobile];

    const _resizeIframe = ($frame, resize) => {
      $frame.addClass(`iframe-preview--${resize}`);
      $frame.contents().find("body").addClass(`iframe-preview--${resize}`);
    }

    // eslint-disable-next-line complexity
    $("#navbarNav").on("click", "a.nav-link", e => {
      const $a = $(e.currentTarget);
      const { dest = "index", resize } = $a.data();
      const $frame = $("iframe");

      $("#navbarNav").find(".nav-link").removeClass("active");
      $a.addClass("active");

      // are we re-sizing current view or changing views?
      const prevView = window.jga.launch_view || dest;
      let resizeOnly = false;
      let canResize = false;
      let url;

      // are we just switching between desktop and mobile views?
      if (dest == "index" && resize && prevView == "index") {
        resizeOnly = true;

        // are we switching to a new view or to the mobile index from another non-index view?
      } else if (dest != "index" || (dest == "index" && prevView != "index")) {
        ([url] = location.href.replace(`/s/${window.jga.adviceSetId}/launch`, `/s/${window.jga.adviceSetId}/${dest}`).split("?"));
        let querystring = qs.parse(location.search.substr(1));

        if (dest.includes("salesforce")) {
          querystring = Object.assign(querystring, { audienceId: "gRGmgTjX7" });
        } else {
          delete querystring.audienceId;
        }

        url += "?" + qs.stringify(querystring);

        // switching to the mobile index from another non-index view
        if (dest == "index" && prevView != "index") {
          canResize = true;
        }
      }

      // save for prevView check
      window.jga.launch_view = dest;

      $frame.removeClass().addClass(iframe_className);
      $frame.contents().find("body").removeClass(iframeClasses).addClass(iframe_className);

      if (resizeOnly) {
        _resizeIframe($frame, resize);
      } else {
        if (canResize) {
          _resizeIframe($frame, resize);
        }
        $frame.attr("src", url);
      }
    });
  }
}
